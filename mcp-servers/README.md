# MCP Servers Setup Guide

This directory contains the Model Context Protocol (MCP) servers for connecting to P21 and POR databases in production mode.

## Prerequisites

1. **Python 3.8+** installed
2. **ODBC Drivers** installed:
   - SQL Server ODBC Driver (for P21)
   - Microsoft Access Database Engine (for POR)
3. **Network access** to the database servers

## Installation

1. Install Python dependencies:
   ```bash
   cd mcp-servers
   pip install -r requirements.txt
   ```

2. Configure environment variables in the main `.env` file:
   - `P21_DSN=P21Live` (already configured)
   - `POR_FILE_PATH=\\ts03\POR\POR.MDB` (already configured)

## Running the Servers

### Start P21 MCP Server (Port 8001)
```bash
python epicore_p21_mcp.py
```

### Start POR MCP Server (Port 8002)
```bash
python por_mcp.py
```

## Testing Connectivity

Once both servers are running, the Tallman Dashboard will automatically connect to them when in production mode. You can test the connections using the "Connection Status" button in the dashboard header.

## Available MCP Tools

### P21 Server Tools:
- `read_table_column` - Read data from P21 SQL Server tables
- `write_table_column` - Update data in P21 SQL Server tables  
- `get_data_dictionary` - Get schema information

### POR Server Tools:
- `read_table_column` - Read data from POR MS Access tables
- `write_table_column` - Update data in POR MS Access tables
- `get_data_dictionary` - Get schema information

## Troubleshooting

1. **ODBC Connection Issues**: Ensure the DSN is configured properly and accessible
2. **File Path Issues**: Verify the POR.MDB file path is correct and accessible
3. **Permission Issues**: Ensure the Python process has appropriate database permissions
4. **Network Issues**: Check firewall settings for ports 8001 and 8002

## Security Notes

- These servers should only be run in secure, internal networks
- Consider implementing authentication if exposing these servers
- Monitor database access logs for security auditing
