

import React, { memo, useMemo } from 'react';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, ComposedChart 
} from 'recharts';
import { DashboardDataPoint, ChartGroup } from '../types';

interface ChartCardProps {
    title: ChartGroup;
    data: DashboardDataPoint[];
}

const COLORS = {
    'Columbus': '#0088FE',
    'Addison': '#00C49F',
    'Lake City': '#FFBB28',
    'City': '#FF8042'
};

const arAgingOrder = ["Current", "1-30", "31-60", "61-90", "90+"];

const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-primary/80 backdrop-blur-sm p-3 border border-secondary rounded-md shadow-lg">
                <p className="font-bold text-text-primary">{label}</p>
                {payload.map((pld: any) => (
                    <div key={pld.name} style={{ color: pld.color }}>
                        {`${pld.name}: ${pld.value.toLocaleString()}`}
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

const renderChart = (title: ChartGroup, data: DashboardDataPoint[]) => {
    try {
        console.log(`[ChartCard - renderChart] Rendering chart for "${title}"`);
        
        // Filter out offline data points
        const onlineData = data.filter(dp => dp.value !== 99999);
        
        // If no data is available after filtering, show a message.
        if (onlineData.length === 0) {
             return (
                <div className="flex items-center justify-center h-full text-text-secondary">
                    <p>Data temporarily unavailable</p>
                </div>
            );
        }

        let chartData: any[];

        const transformData = (keys: string[], xAxis: string, dataPoints: DashboardDataPoint[]) => {
            const groupedData = dataPoints.reduce((acc, dp) => {
                if (!dp || typeof dp.dataPoint !== 'string') {
                    console.warn(`[ChartCard - transformData] Invalid data point found for chart "${title}":`, dp);
                    return acc;
                }
                
                let category: string;
                let groupName: string;

                if (xAxis === 'month' && typeof dp.filterValue === 'string' && dp.filterValue.startsWith('current_month-')) {
                    category = dp.dataPoint;
                    groupName = dp.filterValue as string;
                } else {
                    const parts = dp.dataPoint.split(', ');
                    category = parts[0];
                    groupName = parts.length > 1 ? parts[1].trim() : dp.dataPoint;
                }

                if (!acc[groupName]) {
                    acc[groupName] = { name: groupName };
                }
                acc[groupName][category] = Number(dp.value) || 0;
                return acc;
            }, {} as Record<string, any>);
            
            let result = Object.values(groupedData);

            if (xAxis === 'month' && result.length > 0 && result.some(r => r.name.startsWith('current_month-'))) {
                const monthOrder = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                const today = new Date();
                
                const getSortKey = (name: string): number => {
                    const match = name.match(/current_month-(\d+)/);
                    if (!match) return -1;
                    return parseInt(match[1], 10);
                };
                
                result.forEach(item => {
                    const offset = getSortKey(item.name);
                    if (offset !== -1) {
                        const date = new Date(today);
                        date.setMonth(today.getMonth() - offset);
                        const monthName = monthOrder[date.getMonth()];
                        const shortYear = date.toLocaleDateString('en-US', { year: '2-digit' });
                        item.displayName = `${monthName} '${shortYear}`;
                    } else {
                        item.displayName = item.name;
                    }
                });

                // Sort chronologically (oldest first, i.e., largest offset first)
                result.sort((a, b) => getSortKey(b.name) - getSortKey(a.name));
                
                result = result.map(item => ({ ...item, name: item.displayName }));
            }

            return result;
        }

        switch (title) {
            case ChartGroup.ACCOUNTS:
                chartData = transformData(['payable', 'receivable', 'overdue'], 'month', onlineData);
                return (
                     <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                            <XAxis dataKey="name" fontSize={12} />
                            <YAxis fontSize={12} tickFormatter={(value) => `${value / 1000}k`} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                            <Bar dataKey="payable" fill="#8884d8" />
                            <Bar dataKey="receivable" fill="#82ca9d" />
                            <Bar dataKey="overdue" fill="#ffc658" />
                        </BarChart>
                    </ResponsiveContainer>
                );

            case ChartGroup.CUSTOMER_METRICS:
                chartData = transformData(['new_customers', 'retained_customers'], 'month', onlineData);
                return (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                            <XAxis dataKey="name" fontSize={12} />
                            <YAxis fontSize={12}/>
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                            <Bar dataKey="new_customers" fill="#8884d8" />
                            <Bar dataKey="retained_customers" fill="#82ca9d" />
                        </BarChart>
                    </ResponsiveContainer>
                );

            case ChartGroup.HISTORICAL_DATA:
                // Handle historical data specially - it has both P21 and POR activities in different dataPoint formats
                console.log(`[ChartCard - Historical Data] Processing ${onlineData.length} historical data points:`, onlineData);

                // Group by month and server for historical data
                const historicalGroupedData = onlineData.reduce((acc, dp) => {
                    if (!dp || !dp.dataPoint || !dp.filterValue) {
                        console.warn(`[ChartCard - Historical Data] Invalid historical data point:`, dp);
                        return acc;
                    }

                    const serverName = dp.serverName === 'P21' ? 'P21 Activities' :
                                      dp.serverName === 'POR' ? 'POR Activities' : 'Other Activities';

                    const monthOffset = dp.filterValue as string;
                    const offsetMatch = monthOffset.match(/current_month-(\d+)/);

                    if (!offsetMatch) return acc;

                    const offset = parseInt(offsetMatch[1], 10);
                    const date = new Date();
                    date.setMonth(date.getMonth() - offset);

                    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                    const displayName = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

                    if (!acc[monthKey]) {
                        acc[monthKey] = { name: displayName, displayName, monthKey };
                    }

                    // Set the value based on server type
                    if (dp.serverName === 'P21') {
                        acc[monthKey]['P21 Activities'] = Number(dp.value) || 0;
                    } else if (dp.serverName === 'POR') {
                        acc[monthKey]['POR Activities'] = Number(dp.value) || 0;
                    }

                    return acc;
                }, {} as Record<string, any>);

                chartData = Object.values(historicalGroupedData)
                    .sort((a, b) => a.monthKey.localeCompare(b.monthKey));

                console.log(`[ChartCard - Historical Data] Transformed historical data (${chartData.length} entries):`, chartData);

                if (chartData.length === 0) {
                    console.warn(`[ChartCard - Historical Data] No valid data after processing, showing fallback message`);
                    return (
                        <div className="flex items-center justify-center h-full text-text-secondary">
                            <p>No historical data available</p>
                            <p className="text-xs mt-2">Check console for debug info</p>
                        </div>
                    );
                }

                return (
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                            <XAxis dataKey="name" fontSize={12} />
                            <YAxis fontSize={12} tickFormatter={(value) => value.toLocaleString()} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                            <Bar dataKey="P21 Activities" fill="#0088FE" name="P21 System Activities" />
                            <Line type="monotone" dataKey="POR Activities" stroke="#00C49F" strokeWidth={2} name="POR Rental Activities" />
                        </ComposedChart>
                    </ResponsiveContainer>
                );

            case ChartGroup.INVENTORY:
                // For department-based inventory, create a simple bar chart showing inventory value per department
                chartData = onlineData.map(dp => ({ 
                    name: dp.variableName.replace(' Department', ''), // Remove "Department" suffix for cleaner display
                    value: Number(dp.value) || 0 
                }));
                
                return (
                     <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                            <XAxis dataKey="name" fontSize={12} />
                            <YAxis fontSize={12} tickFormatter={(value) => `$${value / 1000}k`} />
                            <Tooltip content={<CustomTooltip />} formatter={(value: number) => formatCurrency(value)} />
                            <Legend />
                            <Bar dataKey="value" name="Inventory Value" fill="#8884d8" />
                        </BarChart>
                    </ResponsiveContainer>
                )

            case ChartGroup.POR_OVERVIEW:
                 chartData = transformData(['New Rentals', 'Open Rentals', 'Rental Value'], 'month', onlineData);
                 return (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                            <XAxis dataKey="name" fontSize={12} />
                            <YAxis fontSize={12} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                            <Bar dataKey="New Rentals" fill="#413ea0" />
                            <Bar dataKey="Open Rentals" fill="#82ca9d" />
                            <Bar dataKey="Rental Value" fill="#ff7300" />
                        </BarChart>
                    </ResponsiveContainer>
                );

            case ChartGroup.SITE_DISTRIBUTION:
                console.log(`[ChartCard - Site Distribution] Processing ${onlineData.length} data points:`, onlineData);

                chartData = onlineData.map(dp => ({
                    name: dp.dataPoint,
                    value: Number(dp.value) || 0
                }));

                console.log(`[ChartCard - Site Distribution] After mapping (${chartData.length} entries):`, chartData);

                // Filter out zero values and ensure we have valid data
                chartData = chartData.filter(entry => entry.value > 0);
                console.log(`[ChartCard - Site Distribution] After filtering zero values (${chartData.length} entries):`, chartData);

                if (chartData.length === 0) {
                    console.warn(`[ChartCard - Site Distribution] No valid data after filtering, showing fallback message`);
                    return (
                        <div className="flex items-center justify-center h-full text-text-secondary">
                            <p>No site distribution data available</p>
                            <p className="text-xs mt-2">Check console for debug info</p>
                        </div>
                    );
                }

                const total = chartData.reduce((sum, entry) => sum + entry.value, 0);
                console.log(`[ChartCard - Site Distribution] Rendering pie chart with ${chartData.length} entries. Total: ${total}`);

                return (
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={chartData}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                            >
                                {chartData.map((entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={COLORS[entry.name as keyof typeof COLORS] || '#8884d8'}
                                    />
                                ))}
                            </Pie>
                            <Tooltip
                                formatter={(value: number) => [value.toLocaleString(), 'Orders']}
                                labelFormatter={(label) => `Location: ${label}`}
                            />
                            <Legend
                                formatter={(value, entry) => (
                                    <span style={{ color: 'var(--color-text-primary)' }}>
                                        {value} - {entry.payload?.value?.toLocaleString() || 0} orders
                                    </span>
                                )}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                );
            
            case ChartGroup.AR_AGING:
                chartData = onlineData.map(dp => ({ name: dp.dataPoint, 'Amount Due': Number(dp.value) || 0 }))
                                .sort((a,b) => arAgingOrder.indexOf(a.name) - arAgingOrder.indexOf(b.name));
                return (
                     <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                            <XAxis dataKey="name" fontSize={12} />
                            <YAxis fontSize={12} tickFormatter={(value) => `$${value / 1000}k`}/>
                            <Tooltip content={<CustomTooltip />} formatter={(value: number) => formatCurrency(value)} />
                            <Legend />
                            <Bar dataKey="Amount Due" fill="#8884d8" />
                        </BarChart>
                    </ResponsiveContainer>
                );

            case ChartGroup.WEB_ORDERS:
                console.log(`[ChartCard - Web Orders] Processing ${onlineData.length} data points:`, onlineData.map(dp => ({filterValue: dp.filterValue, dataPoint: dp.dataPoint, value: dp.value})));

                // Use transformData to convert our time series data
                chartData = transformData(['Web Orders'], 'month', onlineData);

                console.log(`[ChartCard - Web Orders] Transformed data (${chartData.length} entries):`, chartData);

                if (chartData.length === 0) {
                    return (
                        <div className="flex items-center justify-center h-full text-text-secondary">
                            <p>No web orders data available yet</p>
                        </div>
                    );
                }

                return (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                            <XAxis dataKey="name" fontSize={12} />
                            <YAxis fontSize={12} tickFormatter={(value) => value.toLocaleString()} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                            <Bar dataKey="Web Orders" fill="#0088d8" name="Web Orders" />
                        </BarChart>
                    </ResponsiveContainer>
                );

            case ChartGroup.DAILY_ORDERS: {
                const getDayOffset = (dataPoint: string): number | null => {
                    if (dataPoint === 'Today') {
                        return 0;
                    }
                    const match = dataPoint.match(/^Today-(\d+)$/);
                    if (match) {
                        return parseInt(match[1], 10);
                    }
                    return null;
                };

                chartData = onlineData
                    .map(dp => {
                        const offset = getDayOffset(dp.dataPoint);
                        if (offset === null) return null;
                        
                        const date = new Date();
                        date.setDate(date.getDate() - offset);
                        
                        return {
                            name: date.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }),
                            value: Number(dp.value) || 0,
                            date: date, // Keep original date for sorting
                        };
                    })
                    .filter((item): item is NonNullable<typeof item> => item !== null)
                    .sort((a, b) => a.date.getTime() - b.date.getTime());

                return (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3}/>
                            <XAxis dataKey="name" fontSize={12} />
                            <YAxis fontSize={12}/>
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                            <Bar dataKey="value" name="Orders" fill="#8884d8" />
                        </BarChart>
                    </ResponsiveContainer>
                );
            }

            default: 
                chartData = onlineData.map(dp => ({ name: dp.dataPoint, value: Number(dp.value) || 0 }));
                return (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3}/>
                            <XAxis dataKey="name" fontSize={12} />
                            <YAxis fontSize={12}/>
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                            <Bar dataKey="value" name={title} fill="#8884d8" />
                        </BarChart>
                    </ResponsiveContainer>
                );
        }
    } catch (error) {
        console.error(`[ChartCard - renderChart] Failed to render chart for "${title}"`, error);
        const e = error instanceof Error ? error : new Error(String(error));
        return (
            <div className="text-red-500 flex items-center justify-center h-full p-4">
                <div>
                    <p className="font-bold">Error rendering chart.</p>
                    <p className="text-xs mt-2">{e.message}</p>
                </div>
            </div>
        );
    }
}


const ChartCard: React.FC<ChartCardProps> = memo(({ title, data }) => {
    console.log(`[ChartCard] Component rendering for "${title}" with ${data.length} data points.`);
    
    // Memoize the chart rendering to prevent unnecessary re-renders
    const memoizedChart = useMemo(() => {
        return renderChart(title, data);
    }, [title, data]);

    return (
        <div className="bg-primary p-4 rounded-lg shadow-lg h-80 flex flex-col">
            <h3 className="text-md font-semibold text-text-primary mb-4">{title}</h3>
            <div className="flex-grow">
               {memoizedChart}
            </div>
        </div>
    );
}, (prevProps, nextProps) => {
    // Custom comparison function - only re-render if title changes or data values change
    if (prevProps.title !== nextProps.title) return false;
    if (prevProps.data.length !== nextProps.data.length) return false;
    
    // Compare actual data values to prevent re-render when only object references change
    return prevProps.data.every((prevItem, index) => {
        const nextItem = nextProps.data[index];
        return prevItem.id === nextItem.id && 
               prevItem.value === nextItem.value && 
               prevItem.dataPoint === nextItem.dataPoint &&
               prevItem.lastUpdated === nextItem.lastUpdated;
    });
});

export default ChartCard;
