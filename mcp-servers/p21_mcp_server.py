#!/usr/bin/env python3
"""
P21 MCP Server
Using Model Context Protocol to provide SQL query access to P21 database
"""

import json
import logging
import os
import sys
import time
from typing import Any, Dict, List, Optional

import pyodbc
from mcp import Tool
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import (
    EmptyResult,
    GetPromptResult,
    Prompt,
    PromptMessage,
    Resource,
    ResourceContents,
    ResourceTemplate,
    TextContent,
    ToolResult,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s:%(name)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

class P21Database:
    """P21 Database operations."""

    def __init__(self):
        self.dsn = os.getenv("P21_DSN", "P21live").strip()
        self.connection_string = None
        self._connection_pool: List[Any] = []
        self.max_pool_size = 3
        self.is_connected = False

    def connect(self):
        """Set up connection to P21 database."""
        try:
            if not self.dsn:
                raise ValueError("P21_DSN environment variable must be set")

            self.connection_string = f"DSN={self.dsn};"
            logger.info(f"Connecting to P21 database via DSN: {self.dsn}")

            # Test connection
            test_conn = pyodbc.connect(self.connection_string, timeout=10)
            test_conn.close()

            self.is_connected = True
            logger.info("Successfully connected to P21 database")

        except Exception as e:
            logger.error(f"Failed to connect to P21 database: {e}")
            self.is_connected = False
            raise

    def get_connection(self):
        """Get database connection from pool or create new one."""
        if not self.is_connected or not self.connection_string:
            self.connect()

        try:
            # Try to reuse connection from pool
            if self._connection_pool:
                conn = self._connection_pool.pop()
                return conn

            # Create new connection
            conn = pyodbc.connect(self.connection_string, timeout=5)
            logger.info("Created new database connection")
            return conn

        except Exception as e:
            logger.error(f"Failed to get database connection: {e}")
            raise

    def close_connection(self, conn):
        """Return connection to pool or close if pool is full."""
        try:
            if len(self._connection_pool) < self.max_pool_size:
                self._connection_pool.append(conn)
            else:
                conn.close()
        except Exception as e:
            logger.error(f"Error closing connection: {e}")
            try:
                conn.close()
            except:
                pass

    def execute_sql(self, sql_query: str, limit: int = 1000) -> Dict[str, Any]:
        """Execute arbitrary SQL query."""
        start_time = time.time()
        conn = None

        try:
            logger.info(f"Executing SQL: {sql_query}")
            conn = self.get_connection()
            cursor = conn.cursor()

            # Add basic security check for dangerous operations
            sql_upper = sql_query.upper().strip()
            dangerous_keywords = ['DROP', 'DELETE', 'TRUNCATE', 'INSERT', 'UPDATE', 'ALTER', 'CREATE']

            # Allow only SELECT statements for safety
            if not sql_upper.startswith('SELECT'):
                return {
                    "success": False,
                    "error": "Only SELECT statements are allowed for security reasons",
                    "query": sql_query
                }

            # Check for dangerous keywords in SELECT statements
            for keyword in dangerous_keywords:
                if keyword in sql_upper:
                    return {
                        "success": False,
                        "error": f"SQL contains potentially dangerous keyword: {keyword}",
                        "query": sql_query
                    }

            logger.info("Query validated, executing...")
            cursor.execute(sql_query)

            # Get column names
            columns = [column[0] for column in cursor.description] if cursor.description else []

            # Fetch results with limit
            if limit:
                rows = cursor.fetchmany(limit)
            else:
                rows = cursor.fetchall()

            logger.info(f"Fetched {len(rows)} rows")

            # Convert rows to list of dictionaries
            data = []
            for row in rows:
                row_dict = {}
                for i, value in enumerate(row):
                    column_name = columns[i] if i < len(columns) else f"column_{i}"
                    # Handle different data types
                    if hasattr(value, '__float__'):
                        row_dict[column_name] = float(value)
                    elif hasattr(value, '__int__'):
                        row_dict[column_name] = int(value)
                    elif value is None:
                        row_dict[column_name] = None
                    else:
                        row_dict[column_name] = str(value)
                data.append(row_dict)

            elapsed = time.time() - start_time
            logger.info(f"SQL execution completed in {elapsed:.2f} seconds")

            return {
                "success": True,
                "row_count": len(data),
                "columns": columns,
                "data": data,
                "query": sql_query,
                "limited": limit is not None and len(rows) == limit,
                "execution_time": elapsed
            }

        except Exception as e:
            elapsed = time.time() - start_time
            logger.error(f"Error executing SQL after {elapsed:.2f}s: {e}")
            return {
                "success": False,
                "error": str(e),
                "query": sql_query,
                "execution_time": elapsed
            }

        finally:
            if conn:
                self.close_connection(conn)

    def get_tables(self) -> List[str]:
        """Get list of available tables."""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()

            cursor.execute("""
                SELECT TABLE_NAME
                FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_TYPE = 'BASE TABLE'
                ORDER BY TABLE_NAME
            """)

            tables = [row[0] for row in cursor.fetchall()]
            self.close_connection(conn)
            return tables

        except Exception as e:
            logger.error(f"Error getting tables: {e}")
            return []

    def get_table_schema(self, table_name: str) -> Dict[str, Any]:
        """Get schema information for a specific table."""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()

            cursor.execute("""
                SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = %s
                ORDER BY ORDINAL_POSITION
            """, (table_name,))

            columns = []
            for row in cursor.fetchall():
                columns.append({
                    "name": row[0],
                    "type": row[1],
                    "nullable": row[2] == "YES",
                    "default": row[3]
                })

            self.close_connection(conn)
            return {"table": table_name, "columns": columns}

        except Exception as e:
            logger.error(f"Error getting schema for {table_name}: {e}")
            return {"error": str(e)}

# Global database instance
db = P21Database()

async def list_tools():
    """List available tools."""
    return [
        Tool(
            name="execute_sql",
            description="Execute SQL queries against the P21 database. Only SELECT statements are allowed for security.",
            inputSchema={
                "type": "object",
                "properties": {
                    "sql_query": {
                        "type": "string",
                        "description": "SQL query to execute (must be SELECT)"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of rows to return (default: 1000)",
                        "default": 1000,
                        "minimum": 1,
                        "maximum": 10000
                    }
                },
                "required": ["sql_query"]
            }
        ),
        Tool(
            name="get_data_dictionary",
            description="Get schema information for all tables in the P21 database",
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        ),
        Tool(
            name="list_tables",
            description="List all available tables in the P21 database",
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        )
    ]

async def call_tool(tool_name: str, arguments: Any) -> List[TextContent]:
    """Handle tool calls."""
    logger.info(f"Tool called: {tool_name} with args: {arguments}")

    try:
        if tool_name == "execute_sql":
            sql_query = arguments.get("sql_query", "")
            limit = arguments.get("limit", 1000)

            result = db.execute_sql(sql_query, limit)

            # Format result as JSON for MCP response
            return [TextContent(
                type="text",
                text=json.dumps(result, indent=2)
            )]

        elif tool_name == "list_tables":
            tables = db.get_tables()
            result = {
                "success": True,
                "tables": tables,
                "count": len(tables)
            }
            return [TextContent(
                type="text",
                text=json.dumps(result, indent=2)
            )]

        elif tool_name == "get_data_dictionary":
            tables = db.get_tables()
            schema_info = {}

            for table in tables:
                schema_info[table] = db.get_table_schema(table)

            result = {
                "success": True,
                "tables_examined": len(tables),
                "tables": list(tables),
                "schema": schema_info
            }
            return [TextContent(
                type="text",
                text=json.dumps(result, indent=2)
            )]

        else:
            return [TextContent(
                type="text",
                text=json.dumps({
                    "success": False,
                    "error": f"Unknown tool: {tool_name}"
                }, indent=2)
            )]

    except Exception as e:
        logger.error(f"Error in call_tool: {e}")
        return [TextContent(
            type="text",
            text=json.dumps({
                "success": False,
                "error": str(e)
            }, indent=2)
        )]

async def list_resources():
    """List available resources."""
    return [
        Resource(
            uri="p21://tables",
            name="P21 Tables",
            description="List of all tables in P21 database",
            mimeType="application/json"
        ),
        Resource(
            uri="p21://schema",
            name="P21 Schema",
            description="Complete schema information for P21 database",
            mimeType="application/json"
        )
    ]

async def read_resource(uri: str) -> str:
    """Read a resource."""
    if uri == "p21://tables":
        tables = db.get_tables()
        return json.dumps({"tables": tables}, indent=2)

    elif uri == "p21://schema":
        tables = db.get_tables()
        schema_info = {}
        for table in tables:
            schema_info[table] = db.get_table_schema(table)
        return json.dumps(schema_info, indent=2)

    else:
        raise ValueError(f"Unknown resource: {uri}")

async def main():
    """Main server function."""
    logger.info("Starting P21 MCP Server...")

    try:
        # Initialize database connection
        db.connect()

        # Create MCP server
        server = Server("p21-server", version="1.0.0")

        @server.list_tools()
        async def handle_list_tools():
            return await list_tools()

        @server.call_tool()
        async def handle_call_tool(name, arguments):
            return await call_tool(name, arguments)

        @server.list_resources()
        async def handle_list_resources():
            return await list_resources()

        @server.read_resource()
        async def handle_read_resource(uri):
            return await read_resource(uri)

        # Run server
        logger.info("P21 MCP Server initialized and ready")
        async with stdio_server() as (read_stream, write_stream):
            await server.run(
                read_stream,
                write_stream,
                server.create_initialization_options()
            )

    except Exception as e:
        logger.error(f"P21 MCP Server error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
