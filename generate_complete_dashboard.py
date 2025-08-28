import json
from datetime import datetime

# Read the existing partial data to preserve existing entries
try:
    with open('hooks/dashboard-data.json', 'r') as f:
        existing_data = json.load(f)
        existing_dict = {item['id']: item for item in existing_data}
except:
    existing_dict = {}

# Define the complete structure
data = []

# AR Aging (IDs 1-5) - keep existing
aging_brackets = ['1-30', '31-60', '61-90', '90+', 'Current']
aging_months = [-11, -8, -5, -2, 0]
aging_values = [60000, 35000, 15000, 5000, 140000]
aging_columns = ['amount_30', 'amount_60', 'amount_90', 'amount_over', 'current_balance']

for i in range(1, 6):
    if i in existing_dict:
        data.append(existing_dict[i])
    else:
        bracket = aging_brackets[i-1]
        data.append({
            'id': i,
            'chartGroup': 'AR Aging',
            'variableName': f'AR Aging Amount Due {bracket} Days' if bracket != 'Current' else 'AR Aging Amount Due Current',
            'dataPoint': bracket,
            'serverName': 'P21',
            'tableName': 'balances',
            'productionSqlExpression': f'SELECT SUM(cumulative_balance) AS result FROM balances WHERE year_for_period = CAST(YEAR(DATEADD(month, {aging_months[i-1]}, GETDATE())) AS decimal(9,0)) AND period = CAST(MONTH(DATEADD(month, {aging_months[i-1]}, GETDATE())) AS decimal(9,0));',
            'value': aging_values[i-1],
            'calculationType': 'Totalize receivables within the specified temporal bracket.',
            'lastUpdated': '2024-08-01T00:00:00.000Z',
            'valueColumn': aging_columns[i-1],
            'filterColumn': 'age_bracket',
            'filterValue': f'{bracket} Days' if bracket != 'Current' else 'Current'
        })

# Accounts (IDs 6-41) - 3 variables x 12 months
account_vars = ['payable', 'receivable', 'overdue']
for month in range(12):
    for var_idx, var_name in enumerate(account_vars):
        entry_id = 6 + month * 3 + var_idx
        if entry_id in existing_dict:
            data.append(existing_dict[entry_id])
        else:
            if var_name == 'payable':
                sql_expr = f'SELECT SUM(total_amount) AS result FROM p21_view_soa_get_gl_daily_summaries WHERE account_type = \'Liability\' AND year_for_period = YEAR(DATEADD(month, -{11-month}, GETDATE())) AND period = MONTH(DATEADD(month, -{11-month}, GETDATE()));'
                table_name = 'gl'
                base_value = 1200 + month * 100
            elif var_name == 'receivable':
                sql_expr = f'SELECT SUM(b.cumulative_balance) AS result FROM balances b JOIN chart_of_accts a ON a.account_no = b.account_no WHERE (a.account_no LIKE \'11%\' OR a.account_type LIKE \'%AR%\') AND b.year_for_period = YEAR(DATEADD(month, -{11-month}, GETDATE())) AND b.period = MONTH(DATEADD(month, -{11-month}, GETDATE()));'
                table_name = 'balances'
                base_value = 58000 + month * 1000
            else:  # overdue
                sql_expr = f'SELECT b.year_for_period, b.period, SUM(b.cumulative_balance) AS ar_ending_balance FROM balances b JOIN chart_of_accts a ON a.account_no = b.account_no WHERE (a.account_no LIKE \'11%\' OR a.account_type LIKE \'%AR%\') AND b.year_for_period = YEAR(DATEADD(month, -{11-month}, GETDATE())) AND b.period = MONTH(DATEADD(month, -{11-month}, GETDATE())) GROUP BY b.year_for_period, b.period;'
                table_name = 'balances'
                base_value = max(6000, 8500 - month * 100)
            
            data.append({
                'id': entry_id,
                'chartGroup': 'Accounts',
                'variableName': f'Accounts {var_name.title()}',
                'dataPoint': var_name,
                'serverName': 'P21',
                'tableName': table_name,
                'productionSqlExpression': sql_expr,
                'value': base_value,
                'calculationType': f'Totalize {var_name} for the appropriate calendar month.',
                'lastUpdated': '2024-08-01T00:00:00.000Z',
                'valueColumn': var_name,
                'filterColumn': 'month',
                'filterValue': f'current_month-{11-month}'
            })

# Web Orders (IDs 42-65) - 2 variables x 12 months  
web_vars = ['count', 'amount']
for month in range(12):
    for var_idx, var_name in enumerate(web_vars):
        entry_id = 42 + month * 2 + var_idx
        if entry_id in existing_dict:
            data.append(existing_dict[entry_id])
        else:
            base_sql = f'SELECT {"COUNT(*)" if var_name == "count" else "SUM(total_amount)"} AS result FROM oe_hdr AS h WHERE h.order_date >= DATEFROMPARTS(YEAR(DATEADD(month,{-11+month},GETDATE())), MONTH(DATEADD(month,{-11+month},GETDATE())), 1) AND h.order_date < DATEADD(month, 1, DATEFROMPARTS(YEAR(DATEADD(month,{-11+month},GETDATE())), MONTH(DATEADD(month,{-11+month},GETDATE())), 1)) AND ( LTRIM(RTRIM(COALESCE(h.web_shopper_id, N\'\'))) <> N\'\' OR LTRIM(RTRIM(COALESCE(h.web_shopper_email,N\'\'))) <> N\'\' OR LTRIM(RTRIM(COALESCE(h.web_reference_no, N\'\'))) <> N\'\' );'
            
            data.append({
                'id': entry_id,
                'chartGroup': 'Web Orders',
                'variableName': f'Web Orders {var_name.title()}',
                'dataPoint': var_name,
                'serverName': 'P21',
                'tableName': 'oe_hdr',
                'productionSqlExpression': base_sql,
                'value': 150 + month * 10 if var_name == 'count' else 12000 + month * 500,
                'calculationType': f'{"Count" if var_name == "count" else "Sum"} web orders for the appropriate calendar month.',
                'lastUpdated': '2024-08-01T00:00:00.000Z',
                'valueColumn': var_name,
                'filterColumn': 'month',
                'filterValue': f'current_month-{11-month}'
            })

# Inventory (IDs 66-73) - keep existing
inventory_categories = ['Electronics', 'Automotive', 'Tools', 'Hardware', 'Office Supplies', 'Safety Equipment', 'Industrial', 'Miscellaneous']
inventory_ids = ['ELECTRONICS', 'AUTOMOTIVE', 'TOOLS', 'HARDWARE', 'OFFICE', 'SAFETY', 'INDUSTRIAL', 'MISC']
inventory_values = [250000, 180000, 95000, 120000, 45000, 75000, 320000, 65000]

for i in range(8):
    entry_id = 66 + i
    if entry_id in existing_dict:
        data.append(existing_dict[entry_id])
    else:
        category = inventory_categories[i]
        data.append({
            'id': entry_id,
            'chartGroup': 'Inventory',
            'variableName': f'Inventory Value {category}',
            'dataPoint': category.lower().replace(' ', '_'),
            'serverName': 'P21',
            'tableName': 'inventory_mast',
            'productionSqlExpression': f'SELECT SUM(qty_on_hand * avg_cost) AS result FROM inventory_mast WHERE inv_mast_uid IN (SELECT inv_mast_uid FROM item WHERE item_class_id = \'{inventory_ids[i]}\') AND date_created <= DATEADD(month, -11, GETDATE());',
            'value': inventory_values[i],
            'calculationType': 'Calculate inventory value by category for the appropriate calendar month.',
            'lastUpdated': '2024-08-01T00:00:00.000Z',
            'valueColumn': 'value',
            'filterColumn': 'category',
            'filterValue': category
        })

# POR Overview (IDs 74-97) - 2 variables x 12 months
por_vars = ['orders', 'revenue']
for month in range(12):
    for var_idx, var_name in enumerate(por_vars):
        entry_id = 74 + month * 2 + var_idx
        data.append({
            'id': entry_id,
            'chartGroup': 'POR Overview',
            'variableName': f'POR {var_name.title()}',
            'dataPoint': var_name,
            'serverName': 'P21',
            'tableName': 'oe_hdr' if var_name == 'orders' else 'invoice_hdr',
            'productionSqlExpression': f'SELECT {"COUNT(*)" if var_name == "orders" else "SUM(total_amount)"} AS result FROM {"oe_hdr" if var_name == "orders" else "invoice_hdr"} WHERE {"order_date" if var_name == "orders" else "invoice_date"} >= DATEFROMPARTS(YEAR(DATEADD(month,{-11+month},GETDATE())), MONTH(DATEADD(month,{-11+month},GETDATE())), 1) AND {"order_date" if var_name == "orders" else "invoice_date"} < DATEADD(month, 1, DATEFROMPARTS(YEAR(DATEADD(month,{-11+month},GETDATE())), MONTH(DATEADD(month,{-11+month},GETDATE())), 1));',
            'value': 450 + month * 20 if var_name == 'orders' else 85000 + month * 2000,
            'calculationType': f'{"Count" if var_name == "orders" else "Sum"} POR data for the appropriate calendar month.',
            'lastUpdated': '2024-08-01T00:00:00.000Z',
            'valueColumn': var_name,
            'filterColumn': 'month',
            'filterValue': f'current_month-{11-month}'
        })

# Daily Orders (IDs 98-104) - 7 days
for day in range(7):
    entry_id = 98 + day
    data.append({
        'id': entry_id,
        'chartGroup': 'Daily Orders',
        'variableName': f'Daily Orders Day {day + 1}',
        'dataPoint': f'day_{day + 1}',
        'serverName': 'P21',
        'tableName': 'oe_hdr',
        'productionSqlExpression': f'SELECT COUNT(*) AS result FROM oe_hdr WHERE order_date = DATEADD(day, -{6-day}, CAST(GETDATE() AS DATE));',
        'value': 45 + day * 5,
        'calculationType': 'Count daily orders for specific day.',
        'lastUpdated': '2024-08-01T00:00:00.000Z',
        'valueColumn': 'orders',
        'filterColumn': 'day',
        'filterValue': f'day-{6-day}'
    })

# Historical Data (IDs 105-140) - 3 variables x 12 months
hist_vars = ['sales', 'orders', 'customers']
for month in range(12):
    for var_idx, var_name in enumerate(hist_vars):
        entry_id = 105 + month * 3 + var_idx
        if var_name == 'sales':
            table_name = 'invoice_hdr'
            sql_expr = f'SELECT SUM(total_amount) AS result FROM invoice_hdr WHERE invoice_date >= DATEFROMPARTS(YEAR(DATEADD(month,{-11+month},GETDATE())), MONTH(DATEADD(month,{-11+month},GETDATE())), 1) AND invoice_date < DATEADD(month, 1, DATEFROMPARTS(YEAR(DATEADD(month,{-11+month},GETDATE())), MONTH(DATEADD(month,{-11+month},GETDATE())), 1));'
            base_value = 75000 + month * 3000
        elif var_name == 'orders':
            table_name = 'oe_hdr'
            sql_expr = f'SELECT COUNT(*) AS result FROM oe_hdr WHERE order_date >= DATEFROMPARTS(YEAR(DATEADD(month,{-11+month},GETDATE())), MONTH(DATEADD(month,{-11+month},GETDATE())), 1) AND order_date < DATEADD(month, 1, DATEFROMPARTS(YEAR(DATEADD(month,{-11+month},GETDATE())), MONTH(DATEADD(month,{-11+month},GETDATE())), 1));'
            base_value = 850 + month * 50
        else:  # customers
            table_name = 'customer'
            sql_expr = f'SELECT COUNT(DISTINCT customer_id) AS result FROM oe_hdr WHERE order_date >= DATEFROMPARTS(YEAR(DATEADD(month,{-11+month},GETDATE())), MONTH(DATEADD(month,{-11+month},GETDATE())), 1) AND order_date < DATEADD(month, 1, DATEFROMPARTS(YEAR(DATEADD(month,{-11+month},GETDATE())), MONTH(DATEADD(month,{-11+month},GETDATE())), 1));'
            base_value = 125 + month * 8
        
        data.append({
            'id': entry_id,
            'chartGroup': 'Historical Data',
            'variableName': f'Historical {var_name.title()}',
            'dataPoint': var_name,
            'serverName': 'P21',
            'tableName': table_name,
            'productionSqlExpression': sql_expr,
            'value': base_value,
            'calculationType': f'Historical {var_name} data for the appropriate calendar month.',
            'lastUpdated': '2024-08-01T00:00:00.000Z',
            'valueColumn': var_name,
            'filterColumn': 'month',
            'filterValue': f'current_month-{11-month}'
        })

# Customer Metrics (IDs 141-164) - 2 variables x 12 months
customer_vars = ['new_customers', 'retained_customers']
for month in range(12):
    for var_idx, var_name in enumerate(customer_vars):
        entry_id = 141 + month * 2 + var_idx
        if var_name == 'new_customers':
            sql_expr = f'SELECT COUNT(*) AS result FROM customer WHERE date_created >= DATEFROMPARTS(YEAR(DATEADD(month,{-11+month},GETDATE())), MONTH(DATEADD(month,{-11+month},GETDATE())), 1) AND date_created < DATEADD(month, 1, DATEFROMPARTS(YEAR(DATEADD(month,{-11+month},GETDATE())), MONTH(DATEADD(month,{-11+month},GETDATE())), 1));'
            base_value = 25 + month * 2
        else:  # retained_customers
            sql_expr = f'SELECT COUNT(DISTINCT c.customer_id) AS result FROM customer c JOIN oe_hdr o ON c.customer_id = o.customer_id WHERE o.order_date >= DATEFROMPARTS(YEAR(DATEADD(month,{-11+month},GETDATE())), MONTH(DATEADD(month,{-11+month},GETDATE())), 1) AND o.order_date < DATEADD(month, 1, DATEFROMPARTS(YEAR(DATEADD(month,{-11+month},GETDATE())), MONTH(DATEADD(month,{-11+month},GETDATE())), 1)) AND c.date_created < DATEFROMPARTS(YEAR(DATEADD(month,{-11+month},GETDATE())), MONTH(DATEADD(month,{-11+month},GETDATE())), 1);'
            base_value = 95 + month * 5
        
        data.append({
            'id': entry_id,
            'chartGroup': 'Customer Metrics',
            'variableName': f'Customer {var_name.replace("_", " ").title()}',
            'dataPoint': var_name,
            'serverName': 'P21',
            'tableName': 'customer',
            'productionSqlExpression': sql_expr,
            'value': base_value,
            'calculationType': f'Customer metrics for the appropriate calendar month.',
            'lastUpdated': '2024-08-01T00:00:00.000Z',
            'valueColumn': var_name,
            'filterColumn': 'month',
            'filterValue': f'current_month-{11-month}'
        })

# Key Metrics (IDs 165-171) - keep existing
key_metrics = [
    ('Total Sales YTD', 'Total Orders', 'SELECT COUNT(order_no) AS result FROM oe_hdr;', 12540),
    ('Total Orders YTD', 'Open Orders (/day)', 'SELECT COUNT(order_no) AS result FROM oe_hdr WHERE status = \'open\' AND CAST(order_date AS DATE) = CAST(GETDATE() AS DATE);', 85),
    ('Average Order Value', 'All Open Orders', 'SELECT COUNT(order_no) AS result FROM oe_hdr WHERE status = \'open\';', 1250),
    ('Gross Profit Margin', 'Daily Revenue', 'SELECT SUM(total_amount) AS result FROM invoice_hdr WHERE CAST(invoice_date AS DATE) = CAST(GETDATE() AS DATE);', 415230),
    ('Customer Acquisition Rate', 'Open Invoices', 'SELECT SUM(total_amount) AS result FROM invoice_hdr WHERE status = \'open\';', 2350000),
    ('Inventory Turnover', 'Orders Backloged', 'SELECT COUNT(DISTINCT order_no) AS result FROM oe_line WHERE status = \'backordered\';', 310),
    ('Customer Retention Rate', 'Total Sales (Monthly)', 'SELECT SUM(total_amount) AS result FROM invoice_hdr WHERE invoice_date >= DATEADD(month, DATEDIFF(month, 0, GETDATE()), 0) AND invoice_date < DATEADD(month, DATEDIFF(month, 0, GETDATE()) + 1, 0);', 8345000)
]

for i, (var_name, data_point, sql_expr, value) in enumerate(key_metrics):
    entry_id = 165 + i
    if entry_id in existing_dict:
        data.append(existing_dict[entry_id])
    else:
        data.append({
            'id': entry_id,
            'chartGroup': 'Key Metrics',
            'variableName': var_name,
            'dataPoint': data_point,
            'serverName': 'P21',
            'tableName': 'oe_hdr' if 'order' in sql_expr.lower() else 'invoice_hdr',
            'productionSqlExpression': sql_expr,
            'value': value,
            'calculationType': f'Key business metrics calculation.',
            'lastUpdated': '2024-08-01T00:00:00.000Z',
            'valueColumn': 'order_no' if 'order_no' in sql_expr else 'total_amount'
        })

# Site Distribution (IDs 172-174) - keep existing
site_locations = ['Columbus', 'Addison', 'City']
for i, location in enumerate(site_locations):
    entry_id = 172 + i
    if entry_id in existing_dict:
        data.append(existing_dict[entry_id])
    else:
        data.append({
            'id': entry_id,
            'chartGroup': 'Site Distribution',
            'variableName': f'Site Distribution {location}',
            'dataPoint': location,
            'serverName': 'P21',
            'tableName': 'branch',
            'productionSqlExpression': f'SELECT COUNT(*) as result FROM branch WHERE location_name = \'{location}\';',
            'value': 1,
            'calculationType': 'Totalize revenue from the specified geographical locus.',
            'lastUpdated': '2024-08-01T00:00:00.000Z',
            'valueColumn': 'sales',
            'filterColumn': 'site_name',
            'filterValue': location
        })

# Sort data by ID to ensure proper order
data.sort(key=lambda x: x['id'])

# Save the complete data
with open('hooks/dashboard-data.json', 'w') as f:
    json.dump(data, f, indent=4)

print(f'Generated complete dashboard data with {len(data)} entries')
print(f'ID range: {data[0]["id"]} to {data[-1]["id"]}')

# Verify structure
structure_check = {
    'AR Aging': (1, 5, 5),
    'Accounts': (6, 41, 36),
    'Web Orders': (42, 65, 24),
    'Inventory': (66, 73, 8),
    'POR Overview': (74, 97, 24),
    'Daily Orders': (98, 104, 7),
    'Historical Data': (105, 140, 36),
    'Customer Metrics': (141, 164, 24),
    'Key Metrics': (165, 171, 7),
    'Site Distribution': (172, 174, 3)
}

for group, (start, end, expected) in structure_check.items():
    count = len([d for d in data if d['chartGroup'] == group])
    print(f'{group}: {count}/{expected} entries (IDs {start}-{end})')
