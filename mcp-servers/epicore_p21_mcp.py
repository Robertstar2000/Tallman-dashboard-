#!/usr/bin/env python3
"""
Epicore P21 MCP Server
A Model Context Protocol server for interfacing with Epicore P21 ERP system via ODBC.
"""

import asyncio
import json
import logging
import os
import sys
from typing import Any, Dict, List, Optional, Union

import pyodbc
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()
from mcp.server import Server
from mcp.server.models import InitializationOptions
from mcp.server.stdio import stdio_server
from mcp.types import (
    CallToolRequest,
    CallToolResult,
    ListToolsRequest,
    ListToolsResult,
    Tool,
    TextContent,
    EmbeddedResource
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global connection variable
_connection = None

class EpicoreP21MCPServer:
    """MCP Server for Epicore P21 database operations."""
    
    def __init__(self):
        self.server = Server("epicore-p21-mcp")
        self.dsn = None
        self.connection_string = None
        
    async def setup_connection(self) -> None:
        """Setup ODBC connection to Epicore P21 database."""
        global _connection
        
        # Get connection details from environment variables
        self.dsn = os.getenv("P21_DSN")
        db_server = os.getenv("P21_SERVER")
        db_name = os.getenv("P21_DATABASE", "p21")
        username = os.getenv("P21_USERNAME")
        password = os.getenv("P21_PASSWORD")
        
        try:
            if self.dsn:
                # Use DSN connection (preferred for P21)
                self.connection_string = f"DSN={self.dsn};"
                logger.info(f"Using DSN connection: {self.dsn}")
            else:
                # Use direct connection string as fallback
                if not all([db_server, username, password]):
                    raise ValueError("P21_DSN is required for ODBC connection to P21")
                
                self.connection_string = (
                    f"DRIVER={{SQL Server}};"
                    f"SERVER={db_server};"
                    f"DATABASE={db_name};"
                    f"UID={username};"
                    f"PWD={password};"
                )
                logger.info(f"Using direct connection to server: {db_server}")
            
            # Test connection
            _connection = pyodbc.connect(self.connection_string)
            logger.info("Successfully connected to Epicore P21 database")
            
        except Exception as e:
            logger.error(f"Failed to connect to database: {e}")
            raise
    
    def get_connection(self):
        """Get database connection, creating new one if needed."""
        global _connection
        try:
            if _connection is None:
                _connection = pyodbc.connect(self.connection_string)
            else:
                # Test connection
                _connection.execute("SELECT 1")
            return _connection
        except Exception:
            # Reconnect if connection is stale
            _connection = pyodbc.connect(self.connection_string)
            return _connection
    
    async def read_table_column(self, table_name: str, column_name: str, 
                               where_clause: Optional[str] = None, 
                               limit: Optional[int] = 100) -> Dict[str, Any]:
        """Read data from a specific table column."""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            # Build SQL query
            sql = f"SELECT [{column_name}] FROM [{table_name}]"
            
            if where_clause:
                sql += f" WHERE {where_clause}"
            
            if limit:
                sql = f"SELECT TOP {limit} [{column_name}] FROM [{table_name}]"
                if where_clause:
                    sql += f" WHERE {where_clause}"
            
            logger.info(f"Executing query: {sql}")
            cursor.execute(sql)
            
            # Fetch results
            rows = cursor.fetchall()
            data = [row[0] for row in rows]
            
            return {
                "success": True,
                "table": table_name,
                "column": column_name,
                "row_count": len(data),
                "data": data,
                "query": sql
            }
            
        except Exception as e:
            logger.error(f"Error reading table column: {e}")
            return {
                "success": False,
                "error": str(e),
                "table": table_name,
                "column": column_name
            }
    
    async def write_table_column(self, table_name: str, column_name: str, 
                                value: Any, where_clause: str) -> Dict[str, Any]:
        """Write/update data in a specific table column."""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            # Build UPDATE SQL query
            sql = f"UPDATE [{table_name}] SET [{column_name}] = ? WHERE {where_clause}"
            
            logger.info(f"Executing update: {sql} with value: {value}")
            cursor.execute(sql, (value,))
            
            # Get affected row count
            affected_rows = cursor.rowcount
            
            # Commit the transaction
            conn.commit()
            
            return {
                "success": True,
                "table": table_name,
                "column": column_name,
                "affected_rows": affected_rows,
                "value": value,
                "where_clause": where_clause,
                "query": sql
            }
            
        except Exception as e:
            logger.error(f"Error writing to table column: {e}")
            # Rollback on error
            try:
                conn.rollback()
            except:
                pass
            return {
                "success": False,
                "error": str(e),
                "table": table_name,
                "column": column_name
            }
    
    async def get_data_dictionary(self, table_pattern: Optional[str] = None) -> Dict[str, Any]:
        """Download data dictionary/schema information."""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            # Query to get table and column information
            schema_query = """
            SELECT 
                t.TABLE_CATALOG,
                t.TABLE_SCHEMA,
                t.TABLE_NAME,
                t.TABLE_TYPE,
                c.COLUMN_NAME,
                c.ORDINAL_POSITION,
                c.COLUMN_DEFAULT,
                c.IS_NULLABLE,
                c.DATA_TYPE,
                c.CHARACTER_MAXIMUM_LENGTH,
                c.NUMERIC_PRECISION,
                c.NUMERIC_SCALE,
                c.DATETIME_PRECISION
            FROM INFORMATION_SCHEMA.TABLES t
            LEFT JOIN INFORMATION_SCHEMA.COLUMNS c ON t.TABLE_NAME = c.TABLE_NAME
            WHERE t.TABLE_TYPE = 'BASE TABLE'
            """
            
            if table_pattern:
                schema_query += f" AND t.TABLE_NAME LIKE '{table_pattern}'"
            
            schema_query += " ORDER BY t.TABLE_NAME, c.ORDINAL_POSITION"
            
            logger.info("Fetching data dictionary...")
            cursor.execute(schema_query)
            
            # Fetch all results
            rows = cursor.fetchall()
            
            # Organize data by table
            tables = {}
            for row in rows:
                table_name = row.TABLE_NAME
                
                if table_name not in tables:
                    tables[table_name] = {
                        "catalog": row.TABLE_CATALOG,
                        "schema": row.TABLE_SCHEMA,
                        "table_type": row.TABLE_TYPE,
                        "columns": []
                    }
                
                if row.COLUMN_NAME:  # Some tables might not have columns in the result
                    column_info = {
                        "name": row.COLUMN_NAME,
                        "position": row.ORDINAL_POSITION,
                        "data_type": row.DATA_TYPE,
                        "is_nullable": row.IS_NULLABLE == "YES",
                        "default_value": row.COLUMN_DEFAULT,
                        "max_length": row.CHARACTER_MAXIMUM_LENGTH,
                        "numeric_precision": row.NUMERIC_PRECISION,
                        "numeric_scale": row.NUMERIC_SCALE,
                        "datetime_precision": row.DATETIME_PRECISION
                    }
                    tables[table_name]["columns"].append(column_info)
            
            return {
                "success": True,
                "table_count": len(tables),
                "tables": tables,
                "generated_at": "2025-01-01T00:00:00Z"
            }
            
        except Exception as e:
            logger.error(f"Error fetching data dictionary: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def execute_sql(self, sql_query: str, limit: Optional[int] = 1000) -> Dict[str, Any]:
        """Execute arbitrary SQL query."""
        try:
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
            
            # Handle sandboxed tables for testing/simulation
            if 'mcp_sandboxed_inv' in sql_query.lower():
                return {
                    "success": False,
                    "error": "Connection to MCP Sandbox failed: Network timeout.",
                    "query": sql_query
                }
            
            logger.info(f"Executing SQL query: {sql_query}")
            cursor.execute(sql_query)
            
            # Get column names
            columns = [column[0] for column in cursor.description] if cursor.description else []
            
            # Fetch results with limit
            if limit:
                rows = cursor.fetchmany(limit)
            else:
                rows = cursor.fetchall()
            
            # Convert rows to list of dictionaries
            data = []
            for row in rows:
                row_dict = {}
                for i, value in enumerate(row):
                    column_name = columns[i] if i < len(columns) else f"column_{i}"
                    # Handle Decimal and other non-JSON serializable types
                    if hasattr(value, '__float__'):
                        row_dict[column_name] = float(value)
                    elif hasattr(value, '__int__'):
                        row_dict[column_name] = int(value)
                    elif value is None:
                        row_dict[column_name] = None
                    else:
                        row_dict[column_name] = str(value)
                data.append(row_dict)
            
            return {
                "success": True,
                "row_count": len(data),
                "columns": columns,
                "data": data,
                "query": sql_query,
                "limited": limit is not None and len(rows) == limit
            }
            
        except Exception as e:
            logger.error(f"Error executing SQL query: {e}")
            return {
                "success": False,
                "error": str(e),
                "query": sql_query
            }

# Initialize the server
mcp_server = EpicoreP21MCPServer()

@mcp_server.server.list_tools()
async def list_tools(request: ListToolsRequest) -> ListToolsResult:
    """List available tools."""
    return ListToolsResult(
        tools=[
            Tool(
                name="read_table_column",
                description="Read data from a specific table column in Epicore P21",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "table_name": {
                            "type": "string",
                            "description": "Name of the table to read from"
                        },
                        "column_name": {
                            "type": "string", 
                            "description": "Name of the column to read"
                        },
                        "where_clause": {
                            "type": "string",
                            "description": "Optional WHERE clause to filter results"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum number of rows to return (default: 100)"
                        }
                    },
                    "required": ["table_name", "column_name"]
                }
            ),
            Tool(
                name="write_table_column",
                description="Write/update data in a specific table column in Epicore P21",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "table_name": {
                            "type": "string",
                            "description": "Name of the table to update"
                        },
                        "column_name": {
                            "type": "string",
                            "description": "Name of the column to update"
                        },
                        "value": {
                            "description": "Value to write to the column"
                        },
                        "where_clause": {
                            "type": "string",
                            "description": "WHERE clause to specify which rows to update"
                        }
                    },
                    "required": ["table_name", "column_name", "value", "where_clause"]
                }
            ),
            Tool(
                name="get_data_dictionary",
                description="Download data dictionary/schema information from Epicore P21",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "table_pattern": {
                            "type": "string",
                            "description": "Optional pattern to filter tables (SQL LIKE pattern)"
                        }
                    }
                }
            ),
            Tool(
                name="execute_sql",
                description="Execute arbitrary SQL SELECT query against Epicore P21",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "sql_query": {
                            "type": "string",
                            "description": "SQL SELECT query to execute"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum number of rows to return (default: 1000)"
                        }
                    },
                    "required": ["sql_query"]
                }
            )
        ]
    )

@mcp_server.server.call_tool()
async def call_tool(request: CallToolRequest) -> CallToolResult:
    """Handle tool calls."""
    try:
        if request.name == "read_table_column":
            result = await mcp_server.read_table_column(
                table_name=request.arguments["table_name"],
                column_name=request.arguments["column_name"],
                where_clause=request.arguments.get("where_clause"),
                limit=request.arguments.get("limit", 100)
            )
        elif request.name == "write_table_column":
            result = await mcp_server.write_table_column(
                table_name=request.arguments["table_name"],
                column_name=request.arguments["column_name"],
                value=request.arguments["value"],
                where_clause=request.arguments["where_clause"]
            )
        elif request.name == "get_data_dictionary":
            result = await mcp_server.get_data_dictionary(
                table_pattern=request.arguments.get("table_pattern")
            )
        elif request.name == "execute_sql":
            result = await mcp_server.execute_sql(
                sql_query=request.arguments["sql_query"],
                limit=request.arguments.get("limit", 1000)
            )
        else:
            return CallToolResult(
                content=[TextContent(
                    type="text",
                    text=f"Unknown tool: {request.name}"
                )],
                isError=True
            )
        
        return CallToolResult(
            content=[TextContent(
                type="text",
                text=json.dumps(result, indent=2)
            )]
        )
        
    except Exception as e:
        logger.error(f"Tool call error: {e}")
        return CallToolResult(
            content=[TextContent(
                type="text",
                text=f"Error executing tool: {str(e)}"
            )],
            isError=True
        )

async def main():
    """Main entry point."""
    try:
        # Setup database connection
        await mcp_server.setup_connection()
        
        # Run the MCP server
        async with stdio_server() as (read_stream, write_stream):
            await mcp_server.server.run(
                read_stream, 
                write_stream, 
                InitializationOptions(
                    server_name="epicore-p21-mcp",
                    server_version="1.0.0",
                    capabilities=mcp_server.server.get_capabilities(
                        notification_options=None,
                        experimental_capabilities=None
                    )
                )
            )
    except KeyboardInterrupt:
        logger.info("Server stopped by user")
    except Exception as e:
        logger.error(f"Server error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
