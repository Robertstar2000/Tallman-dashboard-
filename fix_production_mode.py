#!/usr/bin/env python3
"""
Script to fix production mode initialization by adding prodValue: null to all dashboard data files.
This ensures that in production mode, charts start with null values until SQL executions populate them.
"""

import json
import os
import sys

def add_prod_value_to_file(filepath):
    """Add prodValue: null to all entries in a JSON file if it doesn't exist."""
    print(f"Processing: {filepath}")

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)

        if not isinstance(data, list):
            print(f"  ❌ Not an array, skipping")
            return False

        changes_made = 0
        for item in data:
            if isinstance(item, dict) and 'prodValue' not in item:
                item['prodValue'] = None
                changes_made += 1

        if changes_made > 0:
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=4, ensure_ascii=False)
            print(f"  ✅ Added prodValue: null to {changes_made} entries")
            return True
        else:
            print(f"  ℹ️  No changes needed (prodValue already exists)")
            return False

    except Exception as e:
        print(f"  ❌ Error processing {filepath}: {e}")
        return False

# List of all dashboard data files that need prodValue fields
data_files = [
    'hooks/dashboard-data/accounts.json',
    'hooks/dashboard-data/ar-aging.json',
    'hooks/dashboard-data/daily-orders.json',
    'hooks/dashboard-data/historical-data.json',
    'hooks/dashboard-data/key-metrics.json',
    'hooks/dashboard-data/site-distribution.json',
    'hooks/dashboard-data/web-orders.json',
    'hooks/dashboard-data/customer-metrics.json',
    'hooks/dashboard-data/por-overview.json',
    'hooks/dashboard-data/service.json'
]

print("🔧 Fixing production mode initialization...")
print("=" * 50)

total_changes = 0
files_changed = 0

for filepath in data_files:
    if os.path.exists(filepath):
        if add_prod_value_to_file(filepath):
            total_changes += 1
            files_changed += 1
    else:
        print(f"⚠️  File not found: {filepath}")

print("=" * 50)
print(f"📊 Summary: {files_changed} files updated, {total_changes} changes made")
print("🎯 Production mode now properly initializes with null values!")

if files_changed > 0:
    print("\n📝 What this fixes:")
    print("   • Charts will show empty/null initially in production mode")
    print("   • Only SQL execution results will populate prodValue fields")
    print("   • Demo data is preserved in 'value' field for demo mode")
    print("   • Charts receive truly live data from database queries")
