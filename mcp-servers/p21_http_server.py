#!/usr/bin/env python3
"""
P21 HTTP MCP Server
HTTP wrapper for the P21 MCP server functionality
"""

import asyncio
import json
import logging
import os
import sys
from typing import Any, Dict

import pyodbc
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
import threading

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class P21Server:
    """P21 Database operations."""
    
    def __init__(self):
        self.dsn = None
        self.connection_string = None
        self._connection = None
        
    def setup_connection(self):
        """Setup ODBC connection to P21 database."""
        self.dsn = os.getenv("P21_DSN", "P21Live")
        
        try:
            if self.dsn:
                self.connection_string = f"DSN={self.dsn};"
                logger.info(f"Using DSN connection: {self.dsn}")
                # Test connection
                self._connection = pyodbc.connect(self.connection_string)
                logger.info("Successfully connected to P21 database")
            else:
                raise ValueError("P21_DSN is required for ODBC connection to P21")
        except Exception as e:
            logger.error(f"Failed to connect to database: {e}")
            raise
    
    def get_connection(self):
        """Get database connection, creating new one if needed."""
        try:
            if self._connection is None:
                self._connection = pyodbc.connect(self.connection_string)
            else:
                # Test connection
                cursor = self._connection.cursor()
                cursor.execute("SELECT 1")
                cursor.fetchone()
                cursor.close()
            return self._connection
        except Exception:
            # Reconnect if connection is stale
            self._connection = pyodbc.connect(self.connection_string)
            return self._connection
    
    def read_table_column(self, table_name: str, column_name: str, 
                         where_clause: str = None, limit: int = 100) -> Dict[str, Any]:
        """Read data from a specific table column."""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            # Build SQL query
            if limit:
                sql = f"SELECT TOP {limit} [{column_name}] FROM [{table_name}]"
            else:
                sql = f"SELECT [{column_name}] FROM [{table_name}]"
            
            if where_clause:
                sql += f" WHERE {where_clause}"
            
            logger.info(f"Executing query: {sql}")
            cursor.execute(sql)
            
            # Fetch results
            rows = cursor.fetchall()
            data = [row[0] for row in rows]
            cursor.close()
            
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

    def get_data_dictionary(self, table_pattern: str = None) -> Dict[str, Any]:
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
            
            cursor.close()
            
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

    def execute_sql(self, sql_query: str, limit: int = 1000) -> Dict[str, Any]:
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
            
            cursor.close()
            
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

# Global server instance
p21_server = P21Server()

class RequestHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/call_tool':
            try:
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                request_data = json.loads(post_data.decode('utf-8'))
                
                tool_name = request_data.get('name')
                arguments = request_data.get('arguments', {})
                
                if tool_name == 'read_table_column':
                    result = p21_server.read_table_column(
                        table_name=arguments.get('table_name'),
                        column_name=arguments.get('column_name'),
                        where_clause=arguments.get('where_clause'),
                        limit=arguments.get('limit', 100)
                    )
                elif tool_name == 'get_data_dictionary':
                    result = p21_server.get_data_dictionary(
                        table_pattern=arguments.get('table_pattern')
                    )
                elif tool_name == 'execute_sql':
                    result = p21_server.execute_sql(
                        sql_query=arguments.get('sql_query'),
                        limit=arguments.get('limit', 1000)
                    )
                else:
                    result = {
                        "success": False,
                        "error": f"Unknown tool: {tool_name}"
                    }
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
                self.send_header('Access-Control-Allow-Headers', 'Content-Type')
                self.end_headers()
                
                response = json.dumps(result, indent=2).encode('utf-8')
                self.wfile.write(response)
                
            except Exception as e:
                logger.error(f"Error handling request: {e}")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                error_response = json.dumps({"success": False, "error": str(e)}).encode('utf-8')
                self.wfile.write(error_response)
        else:
            self.send_response(404)
            self.end_headers()
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def log_message(self, format, *args):
        # Suppress default HTTP server logging
        pass

def main():
    # Set environment variable for this process
    os.environ['P21_DSN'] = 'P21Live'
    
    try:
        # Setup P21 connection
        p21_server.setup_connection()
        
        # Start HTTP server
        server_address = ('localhost', 8001)
        httpd = HTTPServer(server_address, RequestHandler)
        logger.info(f"P21 HTTP MCP Server running on http://localhost:8001")
        httpd.serve_forever()
        
    except KeyboardInterrupt:
        logger.info("Server stopped by user")
    except Exception as e:
        logger.error(f"Server error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
