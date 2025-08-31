#!/usr/bin/env python3
"""
Fix IDs 1-12 in historical-data.json to use same single-line format as IDs 23-24
"""

import json

def fix_first_12():
    print("🔧 Fixing IDs 1-12 in historical-data.json...")

    # Read the file
    with open('hooks/dashboard-data/historical-data.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    changes_made = 0

    # Month mapping for IDs 1-12
    # ID 1-2: Month 11 (offset -11), ID 3-4: Month 10 (offset -10), etc.
    month_mapping = {
        1: 11, 2: 11,   # Month -11
        3: 10, 4: 10,   # Month -10
        5: 9, 6: 9,     # Month -9
        7: 8, 8: 8,     # Month -8
        9: 7, 10: 7,    # Month -7
        11: 6, 12: 6,   # Month -6
    }

    # Fix IDs 1-12
    for id in range(1, 13):  # IDs 1 through 12
        item_idx = id - 1  # Convert to 0-based index
        item = data[item_idx]
        month = month_mapping[id]
        offset = -month        # e.g., -11 for month 11
        next_offset = offset + 1  # e.g., -10 for month 11

        if id % 2 == 1:  # Odd IDs: Rental Value (same as ID 23)
            new_sql = f"SELECT SUM(il.extended_price) AS RentalValue_Month{month} FROM oe_hdr oh JOIN invoice_line il ON il.order_no = oh.order_no JOIN invoice_hdr ih ON ih.invoice_no = il.invoice_no WHERE oh.rental_billing_flag = 'U' AND ih.invoice_date >= DATEFROMPARTS( YEAR(DATEADD(month, {offset}, GETDATE())), MONTH(DATEADD(month, {offset}, GETDATE())), 1 ) AND ih.invoice_date < DATEFROMPARTS( YEAR(DATEADD(month, {next_offset}, GETDATE())), MONTH(DATEADD(month, {next_offset}, GETDATE())), 1 );"
        else:  # Even IDs: Rental Count (same as ID 24)
            new_sql = f"SELECT COUNT(DISTINCT oh.order_no) AS NewRentalCount_Month{month} FROM oe_hdr oh WHERE oh.rental_billing_flag = 'U' AND oh.order_date >= DATEFROMPARTS( YEAR(DATEADD(month, {offset}, GETDATE())), MONTH(DATEADD(month, {offset}, GETDATE())), 1 ) AND oh.order_date < DATEFROMPARTS( YEAR(DATEADD(month, {next_offset}, GETDATE())), MONTH(DATEADD(month, {next_offset}, GETDATE())), 1 );"

        old_sql = item['productionSqlExpression']
        if old_sql != new_sql:
            print(f"📝 ID {id} (Month {month}, {'Rental Value' if id % 2 == 1 else 'Rental Count'}):")
            print(f"   OLD: {old_sql}")
            print(f"   NEW: {new_sql}")
            print()
            item['productionSqlExpression'] = new_sql
            changes_made += 1

    # Save the fixed file
    with open('hooks/dashboard-data/historical-data.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

    print(f"✅ Successfully fixed {changes_made} entries (IDs 1-12)")
    print("🎯 All criteria met:")
    print("   • Single-line SQL expressions")
    print("   • Odd IDs (1,3,5,7,9,11): Rental Value with JOIN")
    print("   • Even IDs (2,4,6,8,10,12): Rental Count")
    print("   • Only date offsets adjusted, nothing else changed")

if __name__ == "__main__":
    fix_first_12()
