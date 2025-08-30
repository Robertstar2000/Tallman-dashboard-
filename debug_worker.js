// Debug script to monitor MCP worker behavior
// Run this in the browser console to track data point changes

(function() {
    console.log('🔍 MCP Worker Debug Tool Started');

    // Track data point changes
    let lastDataPoints = [];
    let changeCount = 0;

    function logDataPointChanges() {
        try {
            // Get current data points from localStorage
            const stored = localStorage.getItem('dashboard_data_points');
            if (!stored) {
                console.log('❌ No dashboard data in localStorage');
                return;
            }

            const currentDataPoints = JSON.parse(stored);

            // Compare with last snapshot
            if (lastDataPoints.length > 0) {
                const changes = [];

                currentDataPoints.forEach((current, index) => {
                    const last = lastDataPoints[index];
                    if (last && current.prodValue !== last.prodValue) {
                        changes.push({
                            id: current.id,
                            name: current.variableName,
                            oldValue: last.prodValue,
                            newValue: current.prodValue,
                            lastUpdated: current.lastUpdated
                        });
                    }
                });

                if (changes.length > 0) {
                    changeCount++;
                    console.log(`🔄 CHANGE #${changeCount} - ${changes.length} data points updated:`);
                    changes.forEach(change => {
                        console.log(`   ID ${change.id} (${change.name}): ${change.oldValue} → ${change.newValue}`);
                    });
                }
            }

            // Update snapshot
            lastDataPoints = currentDataPoints.map(dp => ({ ...dp }));

            // Log summary every 10 seconds
            if (changeCount > 0 && changeCount % 5 === 0) {
                console.log(`📊 Summary: ${changeCount} total changes detected`);
                console.log('Current prodValues:', currentDataPoints.map(dp => `${dp.id}:${dp.prodValue}`).join(', '));
            }

        } catch (error) {
            console.error('❌ Debug script error:', error);
        }
    }

    // Monitor localStorage changes
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = function(key, value) {
        if (key === 'dashboard_data_points') {
            console.log('💾 localStorage updated for dashboard_data_points');
            // Small delay to let the update complete
            setTimeout(logDataPointChanges, 100);
        }
        return originalSetItem.call(this, key, value);
    };

    // Start monitoring
    console.log('👀 Monitoring data point changes...');
    logDataPointChanges();

    // Check for changes every 2 seconds
    setInterval(logDataPointChanges, 2000);

    // Make functions available globally for manual inspection
    window.debugWorker = {
        getCurrentData: () => {
            const stored = localStorage.getItem('dashboard_data_points');
            return stored ? JSON.parse(stored) : [];
        },
        getChangeCount: () => changeCount,
        resetCounter: () => { changeCount = 0; console.log('🔄 Change counter reset'); },
        logCurrentState: () => {
            const data = window.debugWorker.getCurrentData();
            console.log('📋 Current Data Points:');
            data.forEach(dp => {
                console.log(`   ID ${dp.id}: ${dp.variableName} = ${dp.prodValue} (updated: ${dp.lastUpdated})`);
            });
        }
    };

    console.log('✅ Debug functions available:');
    console.log('   window.debugWorker.getCurrentData()');
    console.log('   window.debugWorker.getChangeCount()');
    console.log('   window.debugWorker.resetCounter()');
    console.log('   window.debugWorker.logCurrentState()');

})();
