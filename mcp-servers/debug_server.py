#!/usr/bin/env python3
"""
Debug version of P21 MCP Server
Enhanced logging and error handling for debugging 500 errors
"""

import json
import logging
import os
import sys
import time
import traceback
from http.server import HTTPServer, BaseHTTPRequestHandler
import pyodbc

# Configure detailed logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s %(levelname)s:%(name)s:%(lineno)d: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('mcp_server_debug.log')
    ]
)
logger = logging.getLogger(__name__)

class P21Server:
    """P21 Database operations with enhanced debugging."""

    def __init__(self):
        self.dsn = os.getenv("P21_DSN", "P21live").strip()
        self.connection_string = None
        self._connection_pool: list = []
        self.max_pool_size = 3
        self.is_connected = False

    def connect(self):
        """Set up connection to P21 database."""
        try:
            if not self.dsn:
                raise ValueError("P21_DSN environment variable must be set")

            self.connection_string = f"DSN={self.dsn};"
            logger.info(f"Connecting to P21 database via DSN: {self.dsn}")

            test_conn = pyodbc.connect(self.connection_string, timeout=10)
            test_conn.close()

            self.is_connected = True
            logger.info("Successfully connected to P21 database")

        except Exception as e:
            logger.error(f"Failed to connect to P21 database: {e}")
            self.is_connected = False
            raise

    def get_connection(self):
        """Get database connection from pool."""
        if not self.is_connected or not self.connection_string:
            self.connect()

        try:
            if self._connection_pool:
                conn = self._connection_pool.pop()
                logger.debug("Reused connection from pool")
                return conn

            conn = pyodbc.connect(self.connection_string, timeout=5)
            logger.debug("Created new database connection")
            return conn

        except Exception as e:
            logger.error(f"Failed to get database connection: {e}")
            raise

    def close_connection(self, conn):
        """Return connection to pool."""
        try:
            if len(self._connection_pool) < self.max_pool_size:
                self._connection_pool.append(conn)
                logger.debug("Connection returned to pool")
            else:
                conn.close()
                logger.debug("Connection pool full, connection closed")
        except Exception as e:
            logger.error(f"Error closing connection: {e}")
            try:
                conn.close()
            except:
                pass

    def execute_sql(self, sql_query: str, limit: int = 1000) -> dict:
        """Execute arbitrary SQL query with enhanced debugging."""
        start_time = time.time()
        conn = None
        try:
            logger.info(f"=== Starting SQL execution ===")
            logger.info(f"Query: {sql_query}")
            logger.info(f"Limit: {limit}")

            # Security checks
            sql_upper = sql_query.upper().strip()
            if not sql_upper.startswith('SELECT'):
                logger.warning(f"Blocked non-SELECT query: {sql_query}")
                return {
                    "success": False,
                    "error": "Only SELECT statements are allowed"
                }

            logger.debug("Getting database connection...")
            conn = self.get_connection()
            logger.debug(f"Connection type: {type(conn)}")

            logger.debug("Creating cursor...")
            cursor = conn.cursor()
            logger.debug(f"Cursor type: {type(cursor)}")

            logger.info("Executing SQL query...")
            try:
                cursor.execute(sql_query)
                logger.info("Query executed successfully")
            except Exception as exec_error:
                logger.error(f"Query execution failed: {exec_error}")
                logger.error(f"Exception type: {type(exec_error)}")
                raise

            # Get column information
            logger.debug("Getting column information...")
            if cursor.description:
                columns = [column[0] for column in cursor.description]
                column_types = [(col[0], col[1].__name__ if hasattr(col[1], '__name__') else str(col[1])) for col in cursor.description]
                logger.info(f"Columns: {columns}")
                logger.debug(f"Column types: {column_types}")
            else:
                logger.warning("No cursor description available")
                columns = []

            logger.info("Fetching results...")
            if limit:
                rows = cursor.fetchmany(limit)
            else:
                rows = cursor.fetchall()

            logger.info(f"Fetched {len(rows)} raw rows")

            # Convert rows to dictionaries
            logger.debug("Converting rows to dictionaries...")
            data = []
            for row_idx, row in enumerate(rows):
                logger.debug(f"Processing row {row_idx}: {row}")
                row_dict = {}
                for i, value in enumerate(row):
                    column_name = columns[i] if i < len(columns) else f"column_{i}"

                    # Detailed type conversion
                    try:
                        if hasattr(value, '__float__'):
                            processed_value = float(value)
                            logger.debug(f"  {column_name}: Decimal({value}) -> {processed_value}")
                        elif hasattr(value, '__int__'):
                            processed_value = int(value)
                            logger.debug(f"  {column_name}: Int({value}) -> {processed_value}")
                        elif value is None:
                            processed_value = None
                            logger.debug(f"  {column_name}: NULL")
                        else:
                            processed_value = str(value)
                            logger.debug(f"  {column_name}: {type(value)}({repr(value)}) -> '{processed_value}'")

                        row_dict[column_name] = processed_value
                    except Exception as type_error:
                        logger.error(f"Type conversion error for {column_name}: {type_error}")
                        row_dict[column_name] = str(value)

                data.append(row_dict)

            cursor.close()
            elapsed = time.time() - start_time
            logger.info(f"SQL execution completed in {elapsed:.2f} seconds")

            return {
                "success": True,
                "row_count": len(data),
                "columns": columns,
                "data": data,
                "execution_time": elapsed
            }

        except Exception as e:
            elapsed = time.time() - start_time
            logger.error(f"=== CRITICAL ERROR AFTER {elapsed:.2f}s ===")
            logger.error(f"Query: {sql_query}")
            logger.error(f"Exception: {e}")
            logger.error(f"Exception type: {type(e)}")
            logger.error(f"Full traceback:\n{traceback.format_exc()}")

            return {
                "success": False,
                "error": str(e),
                "traceback": traceback.format_exc(),
                "execution_time": elapsed
            }

        finally:
            if conn:
                logger.debug("Closing connection...")
                self.close_connection(conn)

    def read_table_column(self, table_name: str, column_name: str,
                         where_clause: str = None, limit: int = 100) -> dict:
        """Read data from a specific table column."""
        start_time = time.time()
        conn = None
        sql = ""  # Initialize sql variable at function scope
        try:
            logger.info("=== Starting TABLE COLUMN READ ===")
            logger.info(f"Table: {table_name}")
            logger.info(f"Column: {column_name}")
            logger.info(f"Limit: {limit}")
            if where_clause:
                logger.info(f"Where: {where_clause}")

            # Security checks
            if not all([table_name, column_name]):
                return {
                    "success": False,
                    "error": "Table name and column name are required"
                }

            logger.debug("Getting database connection...")
            conn = self.get_connection()
            cursor = conn.cursor()

            # Build SQL query
            if limit and limit > 0:
                sql = f"SELECT TOP {limit} [{column_name}] FROM [{table_name}]"
            else:
                sql = f"SELECT [{column_name}] FROM [{table_name}]"

            if where_clause:
                sql += f" WHERE {where_clause}"

            logger.info(f"Executing: {sql}")
            cursor.execute(sql)

            # Fetch results
            rows = cursor.fetchall()
            logger.info(f"Fetched {len(rows)} rows")

            # Extract column values
            data = [row[0] for row in rows]

            cursor.close()
            elapsed = time.time() - start_time
            logger.info(f"Table column read completed in {elapsed:.2f} seconds")

            return {
                "success": True,
                "table": table_name,
                "column": column_name,
                "row_count": len(data),
                "data": data,
                "query": sql,
                "execution_time": elapsed
            }

        except Exception as e:
            elapsed = time.time() - start_time
            logger.error(f"=== CRITICAL ERROR AFTER {elapsed:.2f}s ===")
            logger.error(f"Query: {sql}")
            logger.error(f"Exception: {e}")
            logger.error(f"Full traceback:\n{traceback.format_exc()}")

            return {
                "success": False,
                "error": str(e),
                "table": table_name,
                "column": column_name,
                "traceback": traceback.format_exc(),
                "execution_time": elapsed
            }

        finally:
            if conn:
                logger.debug("Closing connection...")
                self.close_connection(conn)

class DebugRequestHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        logger.info("=== RECEIVED POST REQUEST ===")
        logger.info(f"Path: {self.path}")
        logger.info(f"Headers: {dict(self.headers)}")

        if self.path == '/call_tool':
            try:
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                request_body = post_data.decode('utf-8')

                logger.info(f"Request body length: {len(request_body)}")
                logger.info(f"Request body: {request_body}")

                request_data = json.loads(request_body)
                tool_name = request_data.get('name')
                arguments = request_data.get('arguments', {})

                logger.info(f"Tool name: {tool_name}")
                logger.info(f"Arguments: {arguments}")

                if tool_name == 'execute_sql':
                    logger.info("=== CALLING EXECUTE_SQL ===")
                    result = p21_server.execute_sql(
                        sql_query=arguments.get('sql_query'),
                        limit=arguments.get('limit', 1000)
                    )

                elif tool_name == 'read_table_column':
                    logger.info("=== CALLING READ_TABLE_COLUMN ===")
                    result = p21_server.read_table_column(
                        table_name=arguments.get('table_name'),
                        column_name=arguments.get('column_name'),
                        where_clause=arguments.get('where_clause'),
                        limit=arguments.get('limit', 100)
                    )

                else:
                    result = {
                        "success": False,
                        "error": f"Unknown tool: {tool_name}"
                    }

                logger.info(f"=== RESULT: {json.dumps(result, indent=2)[:500]}... ===")

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
                self.send_header('Access-Control-Allow-Headers', 'Content-Type')
                self.end_headers()

                response = json.dumps(result, indent=2).encode('utf-8')
                logger.info(f"Sending response with {len(response)} bytes")
                self.wfile.write(response)
                logger.info("=== RESPONSE SENT SUCCESSFULLY ===")

            except Exception as e:
                logger.error("=== REQUEST HANDLER ERROR ===")
                logger.error(f"Exception: {e}")
                logger.error(f"Type: {type(e)}")
                logger.error(f"Full traceback:\n{traceback.format_exc()}")

                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()

                error_response = json.dumps({
                    "success": False,
                    "error": str(e),
                    "traceback": traceback.format_exc()
                }).encode('utf-8')

                self.wfile.write(error_response)
                logger.error("=== ERROR RESPONSE SENT ===")
        else:
            logger.info(f"Unknown path: {self.path}")
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        logger.debug("Handling OPTIONS request")
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def log_message(self, format, *args):
        # Suppress default HTTP server logging
        logger.debug(f"HTTP: {format % args}")

# Global server instance
p21_server = P21Server()

def main():
    try:
        logger.info("=== STARTING DEBUG MCP SERVER ===")
        logger.info(f"Python version: {sys.version}")
        logger.info(f"Working directory: {os.getcwd()}")
        logger.info(f"P21_DSN: {os.getenv('P21_DSN')}")

        # Setup P21 connection
        logger.info("Setting up P21 connection...")
        p21_server.connect()

        # Start HTTP server
        port = 8001
        logger.info(f"Starting HTTP server on port {port}")
        server = HTTPServer(('localhost', port), DebugRequestHandler)
        logger.info(f"🚀 P21 Debug MCP Server running on http://localhost:{port}")
        logger.info("Send requests to /call_tool endpoint")

        server.serve_forever()

    except Exception as e:
        logger.error("=== SERVER STARTUP ERROR ===")
        logger.error(f"Exception: {e}")
        logger.error(f"Full traceback:\n{traceback.format_exc()}")
        sys.exit(1)

if __name__ == "__main__":
    main()
