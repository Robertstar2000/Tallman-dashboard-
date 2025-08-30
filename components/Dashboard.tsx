import React from 'react';
import { DashboardDataPoint, ChartGroup } from '../types';
import { KEY_METRICS_VARS } from '../constants';
import KpiCard from './KpiCard';
import ChartCard from './ChartCard';
import Header from './Header';
import { kpiIcons, KpiIconName } from './icons';
import { useGlobal } from './contexts/GlobalContext';

interface DashboardProps {
    dataPoints: DashboardDataPoint[];
}

const getKpiDetails = (variableName: string): { color: string; icon: KpiIconName } => {
    if (variableName.includes('Total Orders')) return { color: 'bg-kpi-blue', icon: 'TotalOrders' };
    if (variableName.includes('Open Orders')) return { color: 'bg-kpi-green', icon: 'OpenOrders' };
    if (variableName.includes('All Open Orders')) return { color: 'bg-kpi-purple', icon: 'OpenOrders2' };
    if (variableName.includes('Daily Revenue')) return { color: 'bg-kpi-yellow', icon: 'DailyRevenue' };
    if (variableName.includes('Open Invoices')) return { color: 'bg-kpi-pink', icon: 'OpenInvoices' };
    if (variableName.includes('OrdersBackloged')) return { color: 'bg-kpi-red', icon: 'OrdersBacklogged' };
    if (variableName.includes('Total Sales Monthly')) return { color: 'bg-kpi-orange', icon: 'TotalSalesMonthly' };
    return { color: 'bg-gray-500', icon: 'TotalOrders' };
};


const Dashboard: React.FC<DashboardProps> = ({ dataPoints }) => {
    const { mode, selectedChartGroup } = useGlobal();
    console.log(`[Dashboard] Rendering with ${dataPoints.length} dataPoints in ${mode} mode, filtered by: ${selectedChartGroup}`);

    // Add a check for dataPoints not being an array, as a final safeguard.
    if (!Array.isArray(dataPoints)) {
        console.error("[Dashboard] Received non-array dataPoints prop:", dataPoints);
        return <div className="text-red-500 p-4">Error: Invalid data received for dashboard.</div>;
    }
    
    // Helper function to get the appropriate value based on current mode
    const getDisplayValue = (dp: DashboardDataPoint): number => {
        let result;
        if (mode === 'production') {
            // In production mode, use prodValue if available, otherwise fall back to value
            result = typeof dp.prodValue === 'number' ? dp.prodValue : (typeof dp.value === 'number' ? dp.value : 0);
            console.log(`[getDisplayValue] PRODUCTION MODE - ${dp.variableName}: prodValue=${dp.prodValue}, value=${dp.value}, using=${result}`);
        } else {
            // In demo mode, use the static value field
            result = typeof dp.value === 'number' ? dp.value : 0;
            console.log(`[getDisplayValue] DEMO MODE - ${dp.variableName}: value=${dp.value}, using=${result}`);
        }
        return result;
    };
    
    // Transform data points to use appropriate values based on mode
    const transformedDataPoints = dataPoints.map(dp => ({
        ...dp,
        value: getDisplayValue(dp)
    }));
    
    const keyMetrics = transformedDataPoints.filter(dp => KEY_METRICS_VARS.includes(dp.variableName));
    let chartDataPoints = transformedDataPoints.filter(dp => !KEY_METRICS_VARS.includes(dp.variableName));
    
    // Apply chart group filtering
    if (selectedChartGroup !== 'All') {
        chartDataPoints = chartDataPoints.filter(dp => dp.chartGroup === selectedChartGroup);
    }
    
    console.log(`[Dashboard] Filtered into ${keyMetrics.length} key metrics and ${chartDataPoints.length} chart data points (filter: ${selectedChartGroup}).`);

    // Debug: Log site distribution specific data
    const siteDistributionData = chartDataPoints.filter(dp => dp.chartGroup === 'Site Distribution');
    console.log(`[Dashboard] Site Distribution data (${siteDistributionData.length} points):`, siteDistributionData.map(dp => ({
        id: dp.id,
        variableName: dp.variableName,
        dataPoint: dp.dataPoint,
        value: dp.value,
        prodValue: dp.prodValue,
        mode: mode
    })));

    const chartOrder: ChartGroup[] = [
        ChartGroup.ACCOUNTS, ChartGroup.CUSTOMER_METRICS, ChartGroup.HISTORICAL_DATA,
        ChartGroup.INVENTORY, ChartGroup.POR_OVERVIEW, ChartGroup.SITE_DISTRIBUTION,
        ChartGroup.DAILY_ORDERS, ChartGroup.WEB_ORDERS, ChartGroup.AR_AGING
    ];

    const groupedCharts = chartDataPoints.reduce((acc, dp) => {
        if (!dp.chartGroup) {
            console.warn('[Dashboard] Data point is missing chartGroup:', dp);
            return acc;
        }
        (acc[dp.chartGroup] = acc[dp.chartGroup] || []).push(dp);
        return acc;
    }, {} as Record<ChartGroup, DashboardDataPoint[]>);
    console.log(`[Dashboard] Grouped chart data (filter: ${selectedChartGroup}):`, groupedCharts);

    return (
        <div className="space-y-6">
            <Header />
            <div className="grid grid-cols-1 lg:grid-cols-6 xl:grid-cols-5 gap-6">
                
                {/* Key Metrics Column */}
                <div className="lg:col-span-1 space-y-4">
                    {keyMetrics.map(metric => {
                         if (!metric || !metric.variableName) {
                            console.error('[Dashboard] Invalid key metric item:', metric);
                            return null;
                        }
                        const { color, icon } = getKpiDetails(metric.variableName);
                        const IconComponent = kpiIcons[icon];
                        return (
                            <KpiCard
                                key={metric.id}
                                metric={metric}
                                colorClassName={color}
                                icon={<IconComponent className="w-8 h-8 text-white opacity-90" />}
                            />
                        );
                    })}
                </div>

                {/* Charts Grid */}
                <div className="lg:col-span-5 xl:col-span-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                   {chartOrder.map(group => {
                       console.log(`[Dashboard] Checking for chart group: ${group} (filter: ${selectedChartGroup})`);
                       if (groupedCharts[group] && groupedCharts[group].length > 0) {
                           console.log(`[Dashboard] Rendering chart for ${group} with ${groupedCharts[group].length} data points.`);
                           return <ChartCard key={group} title={group} data={groupedCharts[group]} />
                       }
                       return null;
                   })}
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
