

import React from 'react';
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
    'City': '#FFBB28'
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
                        <AreaChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                            <XAxis dataKey="name" fontSize={12} />
                            <YAxis fontSize={12} tickFormatter={(value) => `${value / 1000}k`} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                            <Area type="monotone" dataKey="payable" stackId="1" stroke="#8884d8" fill="#8884d8" />
                            <Line type="monotone" dataKey="receivable" stroke="#82ca9d" />
                            <Line type="monotone" dataKey="overdue" stroke="#ffc658" />
                        </AreaChart>
                    </ResponsiveContainer>
                );

            case ChartGroup.CUSTOMER_METRICS:
                chartData = transformData(['New Customers', 'Prospects'], 'month', onlineData);
                return (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                            <XAxis dataKey="name" fontSize={12} />
                            <YAxis fontSize={12}/>
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                            <Line type="monotone" dataKey="New Customers" stroke="#8884d8" />
                            <Line type="monotone" dataKey="Prospects" stroke="#82ca9d" />
                        </LineChart>
                    </ResponsiveContainer>
                );

            case ChartGroup.HISTORICAL_DATA:
                chartData = transformData(['P21', 'POR', 'Total'], 'month', onlineData);
                 return (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                            <XAxis dataKey="name" fontSize={12} />
                            <YAxis fontSize={12} tickFormatter={(value) => `$${value / 1000000}M`}/>
                            <Tooltip content={<CustomTooltip />} formatter={(value: number) => formatCurrency(value)} />
                            <Legend />
                            <Line type="monotone" dataKey="P21" stroke="#8884d8" />
                            <Line type="monotone" dataKey="POR" stroke="#82ca9d" />
                            <Line type="monotone" dataKey="Total" stroke="#ffc658" />
                        </LineChart>
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
                         <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                            <XAxis dataKey="name" fontSize={12} />
                            <YAxis yAxisId="left" fontSize={12} />
                            <YAxis yAxisId="right" orientation="right" fontSize={12} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                            <Bar yAxisId="left" dataKey="New Rentals" barSize={20} fill="#413ea0" />
                            <Bar yAxisId="left" dataKey="Open Rentals" barSize={20} fill="#82ca9d" />
                            <Line yAxisId="right" type="monotone" dataKey="Rental Value" stroke="#ff7300" />
                         </ComposedChart>
                    </ResponsiveContainer>
                );

            case ChartGroup.SITE_DISTRIBUTION:
                chartData = onlineData.map(dp => ({ name: dp.dataPoint, value: Number(dp.value) }));
                const total = chartData.reduce((sum, entry) => sum + entry.value, 0);
                 return (
                     <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5}>
                                 {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[entry.name as keyof typeof COLORS]} />)}
                            </Pie>
                            <Tooltip formatter={(value: number) => formatCurrency(value)} />
                             <Legend formatter={(value, entry) => <span style={{ color: 'var(--color-text-primary)' }}>{value} - {formatCurrency(entry.payload?.value || 0)}</span>} />
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
                         <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                            <XAxis dataKey="name" fontSize={12} />
                            <YAxis yAxisId="left" fontSize={12} />
                            <YAxis yAxisId="right" orientation="right" fontSize={12} tickFormatter={(value) => `$${value / 1000}k`} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                            <Bar yAxisId="left" dataKey="Orders" barSize={20} fill="#8884d8" />
                            <Line yAxisId="right" type="monotone" dataKey="Revenue" stroke="#82ca9d" />
                         </ComposedChart>
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


const ChartCard: React.FC<ChartCardProps> = ({ title, data }) => {
    console.log(`[ChartCard] Component rendering for "${title}" with ${data.length} data points.`);
    return (
        <div className="bg-primary p-4 rounded-lg shadow-lg h-80 flex flex-col">
            <h3 className="text-md font-semibold text-text-primary mb-4">{title}</h3>
            <div className="flex-grow">
               {renderChart(title, data)}
            </div>
        </div>
    );
};

export default ChartCard;