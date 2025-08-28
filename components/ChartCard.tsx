

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
                chartData = transformData(['P21', 'POR', 'Total'], 'month', onlineData);
                 return (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                            <XAxis dataKey="name" fontSize={12} />
                            <YAxis fontSize={12} tickFormatter={(value) => `$${value / 1000000}M`}/>
                            <Tooltip content={<CustomTooltip />} formatter={(value: number) => formatCurrency(value)} />
                            <Legend />
                            <Bar dataKey="P21" fill="#8884d8" />
                            <Bar dataKey="POR" fill="#82ca9d" />
                            <Bar dataKey="Total" fill="#ffc658" />
                        </BarChart>
                    </ResponsiveContainer>
                );

            case ChartGroup.INVENTORY:
                chartData = transformData(['InStock', 'onOrder'], 'department', onlineData);
                return (
                     <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                            <XAxis dataKey="name" fontSize={12} />
                            <YAxis fontSize={12} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                            <Bar dataKey="InStock" fill="#8884d8" />
                            <Bar dataKey="onOrder" fill="#82ca9d" />
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
                chartData = onlineData.map(dp => ({ 
                    name: dp.dataPoint, 
                    value: Number(dp.value) || 0 
                }));
                
                // Filter out zero values and ensure we have valid data
                chartData = chartData.filter(entry => entry.value > 0);
                
                if (chartData.length === 0) {
                    return (
                        <div className="flex items-center justify-center h-full text-text-secondary">
                            <p>No site distribution data available</p>
                        </div>
                    );
                }
                
                const total = chartData.reduce((sum, entry) => sum + entry.value, 0);
                console.log(`[ChartCard] Site Distribution data:`, chartData, `Total: ${total}`);
                
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
                chartData = transformData(['Orders', 'Revenue'], 'month', onlineData);
                 return (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                            <XAxis dataKey="name" fontSize={12} />
                            <YAxis fontSize={12} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                            <Bar dataKey="Orders" fill="#8884d8" />
                            <Bar dataKey="Revenue" fill="#82ca9d" />
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
