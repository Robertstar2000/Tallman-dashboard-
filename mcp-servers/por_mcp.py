#!/usr/bin/env python3
"""
POR MCP Server
A Model Context Protocol server for interfacing with POR MS Access database.
"""

import asyncio
import json
import logging
import os
import sys
from typing import Any, Dict, List, Optional, Union

from dotenv import load_dotenv
import pyodbc

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

class PORMCPServer:
    """MCP Server for POR MS Access database operations."""
    
    def __init__(self):
        self.server = Server("por-mcp")
        self.por_file_path = None
        
    async def setup_connection(self) -> None:
        """Setup connection to POR MS Access database using pyodbc."""
        # Get connection details from environment variables
        self.por_file_path = os.getenv("POR_FILE_PATH")
        
        if not self.por_file_path:
            raise ValueError("POR_FILE_PATH environment variable is required")
        
        try:
            # Test that the file exists and can be opened
            if not os.path.exists(self.por_file_path):
                raise FileNotFoundError(f"POR file not found: {self.por_file_path}")
            
            # Test opening the MDB file with pyodbc
            conn_str = f'DRIVER={{Microsoft Access Driver (*.mdb, *.accdb)}};DBQ={self.por_file_path};'
            with pyodbc.connect(conn_str) as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT COUNT(*) FROM MSysObjects WHERE Type=1 AND Left([Name],1)<>'~'")
                table_count = cursor.fetchone()[0]
                logger.info(f"Successfully connected to POR MS Access database: {self.por_file_path}")
                logger.info(f"Found {table_count} tables")
            
        except Exception as e:
            logger.error(f"Failed to connect to database: {e}")
            raise
    
    def get_db(self):
        """Get database connection using pyodbc."""
        conn_str = f'DRIVER={{Microsoft Access Driver (*.mdb, *.accdb)}};DBQ={self.por_file_path};'
        return pyodbc.connect(conn_str)
    
    async def read_table_column(self, table_name: str, column_name: str, 
                               where_clause: Optional[str] = None, 
                               limit: Optional[int] = 100) -> Dict[str, Any]:
        """Read data from a specific table column."""
        try:
            with self.get_db() as conn:
                cursor = conn.cursor()
                
                # Build SQL query
                sql = f"SELECT [{column_name}] FROM [{table_name}]"
                if where_clause:
                    sql += f" WHERE {where_clause}"
                if limit:
                    sql += f" LIMIT {limit}"
                
                cursor.execute(sql)
                rows = cursor.fetchall()
                
                # Extract data
                data = [row[0] if row[0] is not None else None for row in rows]
                
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
            with self.get_db() as conn:
                cursor = conn.cursor()
                
                # Build SQL UPDATE query
                sql = f"UPDATE [{table_name}] SET [{column_name}] = ? WHERE {where_clause}"
                cursor.execute(sql, (value,))
                conn.commit()
                
                affected_rows = cursor.rowcount
                
                return {
                    "success": True,
                    "table": table_name,
                    "column": column_name,
                    "value": value,
                    "affected_rows": affected_rows,
                    "query": sql
                }
            
        except Exception as e:
            logger.error(f"Error writing table column: {e}")
            return {
                "success": False,
                "error": str(e),
                "table": table_name,
                "column": column_name
            }
    
    async def get_data_dictionary(self, table_pattern: Optional[str] = None) -> Dict[str, Any]:
        """Download data dictionary/schema information from MS Access."""
        try:
            with self.get_db() as conn:
                cursor = conn.cursor()
                tables = {}
                
                # Get list of tables using ODBC metadata
                table_info = cursor.tables(tableType='TABLE')
                
                for row in table_info:
                    table_name = row.table_name
                    
                    # Skip system tables
                    if table_name.startswith('MSys'):
                        continue
                    
                    if table_pattern and table_pattern not in table_name:
                        continue
                    
                    tables[table_name] = {
                        "catalog": row.table_cat,
                        "schema": row.table_schem,
                        "table_type": "TABLE",
                        "columns": []
                    }
                    
                    # Get column information
                    try:
                        column_info = cursor.columns(table=table_name)
                        for col_row in column_info:
                            column_detail = {
                                "name": col_row.column_name,
                                "position": col_row.ordinal_position,
                                "data_type": col_row.type_name,
                                "is_nullable": col_row.nullable == 1,
                                "column_size": col_row.column_size,
                                "decimal_digits": col_row.decimal_digits,
                                "remarks": col_row.remarks
                            }
                            tables[table_name]["columns"].append(column_detail)
                    except Exception as e:
                        logger.warning(f"Could not get column info for table {table_name}: {e}")
                
                return {
                    "success": True,
                    "table_count": len(tables),
                    "tables": tables,
                    "database_type": "MS Access (pyodbc)",
                    "generated_at": "2025-01-01T00:00:00Z"
                }
                
        except Exception as e:
            logger.error(f"Error fetching data dictionary: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    async def execute_sql(self, sql_query: str, limit: Optional[int] = 1000) -> Dict[str, Any]:
        """Execute SQL operations on MS Access database using pyodbc."""
        try:
            sql_upper = sql_query.upper().strip()
            
            # Only allow SELECT statements for safety
            if not sql_upper.startswith('SELECT'):
                return {
                    "success": False,
                    "error": "Only SELECT statements are supported for POR database",
                    "query": sql_query
                }
            
            with self.get_db() as conn:
                cursor = conn.cursor()
                
                # Handle test connection query
                if 'SELECT 1' in sql_upper:
                    return {
                        "success": True,
                        "row_count": 1,
                        "columns": ["test_connection"],
                        "data": [{"test_connection": 1}],
                        "query": sql_query,
                        "limited": False
                    }
                
                # Execute the query
                cursor.execute(sql_query)
                rows = cursor.fetchall()
                
                # Get column names
                columns = [column[0] for column in cursor.description]
                
                # Convert rows to list of dictionaries
                data = []
                for row in rows:
                    row_dict = {}
                    for i, column in enumerate(columns):
                        row_dict[column] = row[i]
                    data.append(row_dict)
                
                # Apply limit if specified and needed
                limited = False
                if limit and len(data) > limit:
                    data = data[:limit]
                    limited = True
                
                return {
                    "success": True,
                    "row_count": len(data),
                    "columns": columns,
                    "data": data,
                    "query": sql_query,
                    "limited": limited
                }
                
        except Exception as e:
            logger.error(f"Error executing SQL query: {e}")
            return {
                "success": False,
                "error": str(e),
                "query": sql_query
            }

# Initialize the server
mcp_server = PORMCPServer()

@mcp_server.server.list_tools()
async def list_tools(request: ListToolsRequest) -> ListToolsResult:
    """List available tools."""
    return ListToolsResult(
        tools=[
            Tool(
                name="read_table_column",
                description="Read data from a specific table column in POR MS Access database",
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
                description="Write/update data in a specific table column in POR MS Access database",
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
                description="Download data dictionary/schema information from POR MS Access database",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "table_pattern": {
                            "type": "string",
                            "description": "Optional pattern to filter tables"
                        }
                    }
                }
            ),
            Tool(
                name="execute_sql",
                description="Execute basic SQL SELECT query against POR MS Access database",
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
                    server_name="por-mcp",
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
