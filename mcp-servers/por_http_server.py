#!/usr/bin/env python3
"""
POR HTTP MCP Server
HTTP wrapper for the POR MS Access database functionality
"""

import json
import logging
import os
import sys
from typing import Any, Dict

import pyodbc
from http.server import HTTPServer, BaseHTTPRequestHandler

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class PORServer:
    """POR MS Access Database operations."""
    
    def __init__(self):
        self.connection_string = None
        self._connection = None
        
    def setup_connection(self):
        """Setup ODBC connection to POR MS Access database."""
        por_file_path = os.getenv("POR_FILE_PATH", r"\\ts03\POR\POR.MDB")
        
        try:
            # Use MS Access ODBC driver
            self.connection_string = (
                r"DRIVER={Microsoft Access Driver (*.mdb, *.accdb)};"
                f"DBQ={por_file_path};"
            )
            
            logger.info(f"Using MS Access connection to: {por_file_path}")
            # Test connection
            self._connection = pyodbc.connect(self.connection_string)
            logger.info("Successfully connected to POR MS Access database")
            
        except Exception as e:
            logger.error(f"Failed to connect to database: {e}")
            raise
    
    def get_connection(self):
        """Get database connection, creating new one if needed."""
        try:
            if self._connection is None:
                self._connection = pyodbc.connect(self.connection_string)
            else:
                # Test connection with a simple query
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
            
            # Build SQL query for MS Access (using TOP instead of LIMIT)
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
            data = [row[0] if row[0] is not None else None for row in rows]
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

    def execute_sql(self, sql_query: str, limit: int = 100) -> Dict[str, Any]:
        """Execute arbitrary SQL query."""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            # For MS Access, modify LIMIT syntax to TOP
            if 'LIMIT' in sql_query.upper():
                sql_query = sql_query.replace('LIMIT', 'TOP')
            
            logger.info(f"Executing SQL query: {sql_query}")
            cursor.execute(sql_query)
            
            # Fetch results
            rows = cursor.fetchall()
            columns = [desc[0] for desc in cursor.description] if cursor.description else []
            
            # Convert rows to list of dictionaries
            data = []
            for row in rows:
                row_dict = {}
                for i, value in enumerate(row):
                    column_name = columns[i] if i < len(columns) else f"column_{i}"
                    row_dict[column_name] = value
                data.append(row_dict)
            
            cursor.close()
            
            return {
                "success": True,
                "data": data,
                "row_count": len(data),
                "columns": columns,
                "query": sql_query
            }
            
        except Exception as e:
            logger.error(f"Error executing SQL query: {e}")
            return {
                "success": False,
                "error": str(e),
                "query": sql_query
            }

# Global server instance
por_server = PORServer()

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
                    result = por_server.read_table_column(
                        table_name=arguments.get('table_name'),
                        column_name=arguments.get('column_name'),
                        where_clause=arguments.get('where_clause'),
                        limit=arguments.get('limit', 100)
                    )
                elif tool_name == 'execute_sql':
                    result = por_server.execute_sql(
                        sql_query=arguments.get('sql_query'),
                        limit=arguments.get('limit', 100)
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
    os.environ['POR_FILE_PATH'] = r'\\ts03\POR\POR.MDB'
    
    try:
        # Setup POR connection
        por_server.setup_connection()
        
        # Start HTTP server
        server_address = ('localhost', 8002)
        httpd = HTTPServer(server_address, RequestHandler)
        logger.info(f"POR HTTP MCP Server running on http://localhost:8002")
        httpd.serve_forever()
        
    except KeyboardInterrupt:
        logger.info("Server stopped by user")
    except Exception as e:
        logger.error(f"Server error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
