#!/usr/bin/env python3
"""
Test script for P21 HTTP MCP Server
Tests the server standalone to verify functionality
"""

import json
import urllib.request
import urllib.error
import time
import sys

def test_p21_server():
    """Test the P21 HTTP MCP server with various queries."""
    
    base_url = "http://localhost:8001"
    
    print("=" * 60)
    print("P21 MCP Server Test Script")
    print("=" * 60)
    
    # Test 1: Simple connection test
    print("\n🔍 Test 1: Simple Connection Test")
    try:
        start_time = time.time()
        
        data = json.dumps({
            'name': 'execute_sql', 
            'arguments': {'sql_query': 'SELECT COUNT(order_no) AS result FROM oe_hdr', 'limit': 1}
        }).encode('utf-8')
        
        req = urllib.request.Request(
            f'{base_url}/call_tool', 
            data=data, 
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        
        print(f"⏱️  Making request to {base_url}/call_tool...")
        with urllib.request.urlopen(req, timeout=30) as response:
            elapsed = time.time() - start_time
            result = json.loads(response.read().decode('utf-8'))
            
            print(f"✅ SUCCESS in {elapsed:.2f}s")
            print(f"📊 Response: {json.dumps(result, indent=2)}")
            
    except urllib.error.HTTPError as e:
        elapsed = time.time() - start_time
        print(f"❌ HTTP ERROR {e.code}: {e.reason} (after {elapsed:.2f}s)")
        try:
            error_content = e.read().decode('utf-8')
            print(f"📋 Error content: {error_content}")
        except:
            pass
            
    except urllib.error.URLError as e:
        elapsed = time.time() - start_time
        print(f"❌ URL ERROR: {e.reason} (after {elapsed:.2f}s)")
        
    except Exception as e:
        elapsed = time.time() - start_time
        print(f"❌ GENERAL ERROR: {e} (after {elapsed:.2f}s)")
    
    # Test 2: Database connectivity test
    print("\n🔍 Test 2: Database Information Test")
    try:
        start_time = time.time()
        
        data = json.dumps({
            'name': 'execute_sql', 
            'arguments': {
                'sql_query': 'SELECT @@VERSION as sql_version, DB_NAME() as database_name, SUSER_NAME() as current_user', 
                'limit': 1
            }
        }).encode('utf-8')
        
        req = urllib.request.Request(
            f'{base_url}/call_tool', 
            data=data, 
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        
        print(f"⏱️  Testing database info query...")
        with urllib.request.urlopen(req, timeout=30) as response:
            elapsed = time.time() - start_time
            result = json.loads(response.read().decode('utf-8'))
            
            print(f"✅ SUCCESS in {elapsed:.2f}s")
            print(f"📊 Response: {json.dumps(result, indent=2)}")
            
    except Exception as e:
        elapsed = time.time() - start_time
        print(f"❌ ERROR: {e} (after {elapsed:.2f}s)")
    
    # Test 3: Table count test
    print("\n🔍 Test 3: Table Count Test")
    try:
        start_time = time.time()
        
        data = json.dumps({
            'name': 'execute_sql', 
            'arguments': {
                'sql_query': 'SELECT COUNT(*) as table_count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = \'BASE TABLE\'', 
                'limit': 1
            }
        }).encode('utf-8')
        
        req = urllib.request.Request(
            f'{base_url}/call_tool', 
            data=data, 
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        
        print(f"⏱️  Counting tables...")
        with urllib.request.urlopen(req, timeout=30) as response:
            elapsed = time.time() - start_time
            result = json.loads(response.read().decode('utf-8'))
            
            print(f"✅ SUCCESS in {elapsed:.2f}s")
            print(f"📊 Response: {json.dumps(result, indent=2)}")
            
    except Exception as e:
        elapsed = time.time() - start_time
        print(f"❌ ERROR: {e} (after {elapsed:.2f}s)")
    
    # Test 4: Data dictionary test
    print("\n🔍 Test 4: Data Dictionary Test")
    try:
        start_time = time.time()
        
        data = json.dumps({
            'name': 'get_data_dictionary', 
            'arguments': {'table_pattern': 'customer%'}
        }).encode('utf-8')
        
        req = urllib.request.Request(
            f'{base_url}/call_tool', 
            data=data, 
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        
        print(f"⏱️  Testing data dictionary...")
        with urllib.request.urlopen(req, timeout=30) as response:
            elapsed = time.time() - start_time
            result = json.loads(response.read().decode('utf-8'))
            
            print(f"✅ SUCCESS in {elapsed:.2f}s")
            print(f"📊 Response keys: {list(result.keys())}")
            if 'tables' in result:
                print(f"📋 Found {len(result.get('tables', {}))} matching tables")
            
    except Exception as e:
        elapsed = time.time() - start_time
        print(f"❌ ERROR: {e} (after {elapsed:.2f}s)")
    
    # Test 5: Multiple rapid requests test
    print("\n🔍 Test 5: Rapid Request Test (5 requests)")
    success_count = 0
    total_time = 0
    
    for i in range(5):
        try:
            start_time = time.time()
            
            data = json.dumps({
                'name': 'execute_sql', 
                'arguments': {'sql_query': f'SELECT {i+1} as request_number', 'limit': 1}
            }).encode('utf-8')
            
            req = urllib.request.Request(
                f'{base_url}/call_tool', 
                data=data, 
                headers={'Content-Type': 'application/json'},
                method='POST'
            )
            
            with urllib.request.urlopen(req, timeout=15) as response:
                elapsed = time.time() - start_time
                total_time += elapsed
                result = json.loads(response.read().decode('utf-8'))
                
                if result.get('success'):
                    success_count += 1
                    print(f"✅ Request {i+1}: SUCCESS in {elapsed:.2f}s")
                else:
                    print(f"❌ Request {i+1}: FAILED in {elapsed:.2f}s - {result.get('error', 'Unknown error')}")
                    
        except Exception as e:
            elapsed = time.time() - start_time
            total_time += elapsed
            print(f"❌ Request {i+1}: ERROR in {elapsed:.2f}s - {e}")
    
    print(f"\n📊 Rapid Test Results:")
    print(f"   Success rate: {success_count}/5 ({success_count/5*100:.1f}%)")
    print(f"   Average time: {total_time/5:.2f}s")
    
    print("\n" + "=" * 60)
    print("Test completed!")
    print("=" * 60)

if __name__ == "__main__":
    test_p21_server()
