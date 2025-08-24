
import React from 'react';
import { DashboardDataPoint } from '../types';

interface KpiCardProps {
    metric: DashboardDataPoint;
    colorClassName: string;
    icon: React.ReactNode;
}

const KpiCard: React.FC<KpiCardProps> = ({ metric, colorClassName, icon }) => {
    const isCurrency = metric.dataPoint.toLowerCase().includes('revenue') || metric.dataPoint.toLowerCase().includes('sales') || metric.dataPoint.toLowerCase().includes('invoices');
    
    const isOffline = metric.value === 99999;

    const formattedValue = isOffline
        ? 'OFFLINE'
        : isCurrency
        ? `$${Number(metric.value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
        : Number(metric.value).toLocaleString('en-US');

    return (
        <div className={`${isOffline ? 'bg-gray-700' : colorClassName} p-4 rounded-lg shadow-lg text-white transition-colors duration-500`}>
            <div className="flex justify-between items-start">
                <div className="flex-grow">
                    <h3 className="text-sm font-medium uppercase tracking-wider">{metric.dataPoint}</h3>
                    <p className="mt-1 text-3xl font-semibold">{formattedValue}</p>
                </div>
                <div className="flex-shrink-0">
                    {icon}
                </div>
            </div>
        </div>
    );
};

export default KpiCard;