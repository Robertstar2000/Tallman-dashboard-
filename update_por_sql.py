#!/usr/bin/env python3
"""
Script to replace all P21 rental value SQL expressions in historical-data.json
with the new template SQL, adjusting only the month offsets.
"""

import json
import re

def update_p21_sql():
    # Load the historical data
    with open('hooks/dashboard-data/historical-data.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Template SQL with placeholders for month offsets
    template_sql = "SELECT SUM(il.extended_price) AS RentalValue_Month{offset} FROM oe_hdr oh JOIN invoice_line il ON il.order_no = oh.order_no JOIN invoice_hdr ih ON ih.invoice_no = il.invoice_no WHERE oh.rental_billing_flag = 'U' AND ih.invoice_date >= DATEFROMPARTS( YEAR(DATEADD(month, {start_offset}, GETDATE())), MONTH(DATEADD(month, {start_offset}, GETDATE())), 1 ) AND ih.invoice_date < DATEFROMPARTS( YEAR(DATEADD(month, {end_offset}, GETDATE())), MONTH(DATEADD(month, {end_offset}, GETDATE())), 1 );"

    changes_made = 0

    # Update each P21 entry (odd IDs - rental value variables)
    for item in data:
        if (item['id'] % 2 == 1):  # P21 entries have odd IDs
            # Extract the month offset from filterValue
            filter_value = item['filterValue']
            match = re.search(r'current_month-?(\d+)?', filter_value)

            if match:
                if match.group(1):  # Has number (e.g., current_month-11)
                    offset = int(match.group(1))
                    start_offset = -offset
                    end_offset = -offset + 1
                    alias_offset = offset
                else:  # No number (e.g., current_month0)
                    start_offset = 0
                    end_offset = 1
                    alias_offset = ''  # Will be Month0 for current month

                # Replace the SQL expression
                new_sql = template_sql.format(
                    start_offset=start_offset,
                    end_offset=end_offset,
                    offset=alias_offset
                )

                # Don't modify the alias - keep it as Month{offset}

                print(f"📝 Updating ID {item['id']} (month {alias_offset}):")
                print(f"   Old: {item['productionSqlExpression']}")
                print(f"   New: {new_sql}")

                item['productionSqlExpression'] = new_sql
                changes_made += 1

    # Save the updated data
    with open('hooks/dashboard-data/historical-data.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

    print(f"\n✅ Updated {changes_made} P21 entries with new Rental Value SQL expressions")
    print("🎯 All P21 entries now use SUM(il.extended_price) with JOIN statements")

if __name__ == "__main__":
    update_p21_sql()
