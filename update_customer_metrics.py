#!/usr/bin/env python3
"""
Script to update customer metrics SQL expressions with proper month offsets.
"""

import json
import re

def update_customer_metrics():
    # Read the current file
    with open('hooks/dashboard-data/customer-metrics.json', 'r') as f:
        data = json.load(f)

    # Process each entry
    for i, entry in enumerate(data):
        entry_id = entry['id']
        filter_value = entry['filterValue']

        # Extract month offset from filter_value (current_month-X)
        match = re.match(r'current_month-(\d+)', filter_value)
        if match:
            month_offset = match.group(1)

            # Determine if this is new customers or prospects based on variableName
            variable_name = entry['variableName']

            if 'New Customers' in variable_name:
                # Update with corrected new customers SQL, just changing the month offset
                # Calculate the next month offset for the upper bound
                upper_month_offset = int(month_offset) - 1
                sql = f"SELECT COUNT(DISTINCT customer_uid) AS new_customers_m{month_offset} FROM customer WHERE date_acct_opened IS NOT NULL AND date_acct_opened >= DATEFROMPARTS(YEAR(DATEADD(month,-{month_offset},GETDATE())), MONTH(DATEADD(month,-{month_offset},GETDATE())), 1) AND date_acct_opened <  DATEFROMPARTS(YEAR(DATEADD(month,-{upper_month_offset},GETDATE())), MONTH(DATEADD(month,-{upper_month_offset},GETDATE())), 1);"
                entry['productionSqlExpression'] = sql
                print(f"Updated ID {entry_id}: New Customers M{month_offset}")

            elif 'Retained' in variable_name or 'Prospects' in variable_name:
                # Update variable name to "Prospects" if it contains "Retained"
                if 'Retained' in variable_name:
                    entry['variableName'] = entry['variableName'].replace('Customer Retained Customers', 'Prospects')
                    entry['dataPoint'] = 'prospects'
                    entry['valueColumn'] = 'prospects'

                # Update with corrected prospects SQL, just changing the month offset
                sql = f"SELECT COUNT(*) AS prospects FROM customer AS c WHERE CAST(c.date_acct_opened AS date) >= DATEFROMPARTS(YEAR(DATEADD(month,-{month_offset},GETDATE())), MONTH(DATEADD(month,-{month_offset},GETDATE())), 1) AND CAST(c.date_acct_opened AS date) < DATEFROMPARTS(YEAR(DATEADD(month,{int(month_offset)-1},GETDATE())), MONTH(DATEADD(month,{int(month_offset)-1},GETDATE())), 1) AND NOT EXISTS (SELECT 1 FROM oe_hdr AS h WHERE h.customer_id = c.customer_id);"
                entry['productionSqlExpression'] = sql
                print(f"Updated ID {entry_id}: Prospects M{month_offset}")

            elif 'New Prospects' in variable_name:
                # Update with corrected new prospects SQL
                sql = f"SELECT COUNT(*) AS new_prospects_m{month_offset} FROM customer AS c WHERE CAST(c.date_acct_opened AS date) >= DATEFROMPARTS(YEAR(DATEADD(month,-{month_offset},GETDATE())), MONTH(DATEADD(month,-{month_offset},GETDATE())), 1) AND CAST(c.date_acct_opened AS date) < DATEFROMPARTS(YEAR(DATEADD(month,{int(month_offset)-1},GETDATE())), MONTH(DATEADD(month,{int(month_offset)-1},GETDATE())), 1) AND NOT EXISTS (SELECT 1 FROM oe_hdr AS h WHERE h.customer_id = c.customer_id);"
                entry['productionSqlExpression'] = sql
                print(f"Updated ID {entry_id}: New Prospects M{month_offset}")

    # Write back to file
    with open('hooks/dashboard-data/customer-metrics.json', 'w') as f:
        json.dump(data, f, indent=2)

    print("\nCustomer metrics file updated successfully!")
    print("Renamed 'Customer Retained Customers' to 'Prospects' and updated all SQL expressions with corrected date offsets.")
    print("Only productionSqlExpression fields were changed - all other fields remain exactly as they were.")

if __name__ == '__main__':
    update_customer_metrics()
