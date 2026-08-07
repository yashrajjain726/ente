class LogViewer {
    constructor() {
        this.logs = [];
        this.filteredLogs = [];
        this.allLoggers = new Set();
        this.allProcesses = new Set();
        this.allLevels = new Set();
        this.currentFilter = {
            selectedLoggers: new Set(),
            selectedLevels: new Set(['WARNING', 'SEVERE', 'SHOUT']),
            selectedProcesses: new Set(),
            searchQuery: '',
            startTime: null,
            endTime: null,
            sortNewestFirst: true
        };
        this.currentOffset = 0;
        this.pageSize = 100;
        this.isLoading = false;

        this.isContextMode = false;
        this.contextTargetLog = null;
        this.contextLogs = [];

        this.deviceInfo = null;
        this.deviceRAM = null;

        this.initializeEventListeners();
    }

    initializeEventListeners() {
        const fileInput = document.getElementById('file-input');
        const browseBtn = document.getElementById('browse-btn');
        const uploadArea = document.getElementById('upload-area');

        browseBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', this.handleFileSelect.bind(this));

        uploadArea.addEventListener('dragover', this.handleDragOver.bind(this));
        uploadArea.addEventListener('drop', this.handleDrop.bind(this));
        uploadArea.addEventListener('dragleave', this.handleDragLeave.bind(this));

        const searchInput = document.getElementById('search-input');
        const clearSearch = document.getElementById('clear-search');
        searchInput.addEventListener('input', this.handleSearch.bind(this));
        clearSearch.addEventListener('click', this.clearSearch.bind(this));

        const filterBtn = document.getElementById('filter-btn');
        const filterDialog = document.getElementById('filter-dialog');
        const closeFilter = document.getElementById('close-filter');
        const cancelFilter = document.getElementById('cancel-filter');
        const applyFilters = document.getElementById('apply-filters');
        const clearFilters = document.getElementById('clear-filters');

        filterBtn.addEventListener('click', this.showFilterDialog.bind(this));
        closeFilter.addEventListener('click', this.hideFilterDialog.bind(this));
        cancelFilter.addEventListener('click', this.hideFilterDialog.bind(this));
        applyFilters.addEventListener('click', this.applyFilters.bind(this));
        clearFilters.addEventListener('click', this.clearAllFilters.bind(this));

        const sortBtn = document.getElementById('sort-btn');
        sortBtn.addEventListener('click', this.toggleSort.bind(this));

        const timelineToggle = document.getElementById('timeline-toggle');
        const startTime = document.getElementById('start-time');
        const endTime = document.getElementById('end-time');
        const resetTimeline = document.getElementById('reset-timeline');

        timelineToggle.addEventListener('click', this.toggleTimeline.bind(this));
        startTime.addEventListener('change', this.handleTimelineChange.bind(this));
        endTime.addEventListener('change', this.handleTimelineChange.bind(this));
        resetTimeline.addEventListener('click', this.resetTimeline.bind(this));

        this.setupDialogListeners();
        this.setupDropdown();
    }

    setupDialogListeners() {
        const analyticsBtn = document.getElementById('analytics-btn');
        const analyticsDialog = document.getElementById('analytics-dialog');
        const closeAnalytics = document.getElementById('close-analytics');
        const closeAnalyticsBtn = document.getElementById('close-analytics-btn');

        analyticsBtn.addEventListener('click', this.showAnalytics.bind(this));
        closeAnalytics.addEventListener('click', this.hideAnalytics.bind(this));
        closeAnalyticsBtn.addEventListener('click', this.hideAnalytics.bind(this));

        const detailDialog = document.getElementById('detail-dialog');
        const closeDetail = document.getElementById('close-detail');
        const closeDetailBtn = document.getElementById('close-detail-btn');
        const copyLog = document.getElementById('copy-log');
        const showContext = document.getElementById('show-context');

        closeDetail.addEventListener('click', this.hideDetailDialog.bind(this));
        closeDetailBtn.addEventListener('click', this.hideDetailDialog.bind(this));
        copyLog.addEventListener('click', this.copyLogDetail.bind(this));
        showContext.addEventListener('click', this.showLogContext.bind(this));

        const exportBtn = document.getElementById('export-btn');
        const clearBtn = document.getElementById('clear-btn');

        exportBtn.addEventListener('click', this.exportLogs.bind(this));
        clearBtn.addEventListener('click', this.clearLogs.bind(this));
    }

    setupDropdown() {
        const dropdown = document.querySelector('.dropdown');
        const dropdownToggle = document.querySelector('.dropdown-toggle');
        
        dropdownToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('active');
        });

        document.addEventListener('click', () => {
            dropdown.classList.remove('active');
        });
    }

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            this.processZipFile(file);
        }
    }

    handleDragOver(event) {
        event.preventDefault();
        event.currentTarget.classList.add('drag-over');
    }

    handleDrop(event) {
        event.preventDefault();
        event.currentTarget.classList.remove('drag-over');
        
        const files = event.dataTransfer.files;
        if (files.length > 0 && files[0].name.endsWith('.zip')) {
            this.processZipFile(files[0]);
        } else {
            alert('Please drop a ZIP file containing log files.');
        }
    }

    handleDragLeave(event) {
        event.currentTarget.classList.remove('drag-over');
    }

    async processZipFile(file) {
        try {
            document.getElementById('loading').style.display = 'block';

            const zip = new JSZip();
            const contents = await zip.loadAsync(file);

            this.logs = [];
            this.deviceInfo = null;
            this.deviceRAM = null;
            let totalLogs = 0;

            for (const [filename, zipEntry] of Object.entries(contents.files)) {
                if (!zipEntry.dir && filename.includes('.log')) {
                    const content = await zipEntry.async('string');
                    const fileLogs = this.parseLogFile(content, filename);
                    this.logs.push(...fileLogs);
                    totalLogs += fileLogs.length;
                }
            }

            this.logs.sort((a, b) => {
                if (this.currentFilter.sortNewestFirst) {
                    return b.timestamp - a.timestamp;
                } else {
                    return a.timestamp - b.timestamp;
                }
            });

            this.extractUniqueValues();
            this.applyCurrentFilter();
            this.showMainContent();
            
        } catch (error) {
            console.error('Error processing ZIP file:', error);
            alert('Error processing ZIP file. Please make sure it contains valid log files.');
        } finally {
            document.getElementById('loading').style.display = 'none';
        }
    }

    parseLogFile(content, filename) {
        const logs = [];
        const lines = content.split('\n');
        let currentLog = null;
        let errorDetails = [];
        let isInMultilineError = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            if (line.startsWith('⤷')) {
                if (currentLog) {
                    errorDetails.push(line);
                    isInMultilineError = true;
                }
                continue;
            }

            const logEntry = this.parseLogLine(line);
            if (logEntry) {
                if (currentLog) {
                    this.finalizeLogEntry(currentLog, errorDetails);
                    logs.push(currentLog);
                }

                if (!this.deviceInfo && logEntry.message.startsWith('Device Info:')) {
                    this.deviceInfo = logEntry.message.substring('Device Info:'.length).trim();
                } else if (!this.deviceRAM && logEntry.message.startsWith('Device RAM:')) {
                    this.deviceRAM = logEntry.message.substring('Device RAM:'.length).trim();
                }

                currentLog = logEntry;
                currentLog.filename = filename;
                errorDetails = [];
                isInMultilineError = false;
            } else if (currentLog) {
                if (line.startsWith('Error:') || line.startsWith('Exception:') || 
                    line.includes('Exception in') || line.includes('ErrorCode=') ||
                    isInMultilineError) {
                    
                    currentLog.message += '\n' + line;
                    if (line.includes('Exception:') || line.includes('Error:')) {
                        isInMultilineError = true;
                    }
                } else {
                    currentLog.message += '\n' + line;
                }
            }
        }

        if (currentLog) {
            this.finalizeLogEntry(currentLog, errorDetails);
            logs.push(currentLog);
        }

        return logs;
    }

    finalizeLogEntry(logEntry, errorDetails) {
        if (errorDetails.length > 0) {
            const errorInfo = this.parseErrorDetails(errorDetails);
            if (errorInfo.error) logEntry.error = errorInfo.error;
            if (errorInfo.stackTrace) logEntry.stackTrace = errorInfo.stackTrace;
            if (errorInfo.id) logEntry.id = errorInfo.id;
            
            logEntry.message += '\n' + errorDetails.join('\n');
        }

        this.extractInlineErrors(logEntry);
    }

    extractInlineErrors(logEntry) {
        const lines = logEntry.message.split('\n');
        let messageLines = [];
        let errorLines = [];
        let stackTraceLines = [];
        let isInStackTrace = false;
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            if (trimmed.startsWith('Error:') || trimmed.startsWith('Exception:')) {
                if (!logEntry.error) {
                    logEntry.error = trimmed;
                }
                errorLines.push(trimmed);
            } else if (trimmed.startsWith('#') && (trimmed.includes('package:') || trimmed.includes('<asynchronous'))) {
                stackTraceLines.push(trimmed);
                isInStackTrace = true;
            } else if (isInStackTrace && (trimmed === '' || trimmed.startsWith('<') || trimmed.includes('suspension'))) {
                stackTraceLines.push(trimmed);
            } else {
                messageLines.push(line);
                isInStackTrace = false;
            }
        }
        
        if (messageLines.length < lines.length) {
            logEntry.message = messageLines.join('\n').trim();
            
            if (!logEntry.stackTrace && stackTraceLines.length > 0) {
                logEntry.stackTrace = stackTraceLines.join('\n');
            }
        }
    }

    parseLogLine(line) {
        const patterns = [
            /^\[([^\]]+)\]\s*\[([^\]]+)\]\s*\[([^\]]+)\]\s*\[([^\]]+)\]\s*(.*)$/,
            /^\[([^\]]+)\]\s*\[([^\]]+)\]\s*\[([^\]]+)\]\s*(.*)$/
        ];

        for (let i = 0; i < patterns.length; i++) {
            const match = line.match(patterns[i]);
            if (match) {
                let processPrefix, loggerName, level, timestampStr, message;
                
                if (i === 0) {
                    [, processPrefix, loggerName, level, timestampStr, message] = match;
                } else {
                    [, loggerName, level, timestampStr, message] = match;
                    processPrefix = '';
                }

                const timestamp = this.parseTimestamp(timestampStr);
                if (!timestamp) continue;

                return {
                    processPrefix: processPrefix || '',
                    loggerName,
                    level: level.toUpperCase(),
                    timestamp,
                    timestampStr,
                    message: message || '',
                    error: null,
                    stackTrace: null,
                    id: null
                };
            }
        }

        return null;
    }

    parseTimestamp(timestampStr) {
        try {
            const parts = timestampStr.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\.?(\d+)?/);
            if (parts) {
                const [, date, time, microseconds] = parts;
                const fullTimestamp = `${date}T${time}.${(microseconds || '000').padEnd(3, '0').substring(0, 3)}Z`;
                return new Date(fullTimestamp);
            }
        } catch (error) {
            console.warn('Failed to parse timestamp:', timestampStr, error);
        }
        return null;
    }

    parseErrorDetails(errorLines) {
        const result = { error: null, stackTrace: null, id: null };
        let stackTraceLines = [];
        
        for (const line of errorLines) {
            if (line.startsWith('⤷ error:')) {
                result.error = line.substring(9).trim();
            } else if (line.startsWith('⤷ trace:')) {
                stackTraceLines.push(line.substring(9).trim());
            } else if (line.startsWith('⤷ id:')) {
                result.id = line.substring(6).trim();
            } else if (line.startsWith('⤷ type:')) {
                const type = line.substring(8).trim();
                if (result.error) {
                    result.error = `${type}: ${result.error}`;
                } else {
                    result.error = type;
                }
            } else if (stackTraceLines.length > 0) {
                stackTraceLines.push(line.replace(/^⤷\s*/, ''));
            }
        }
        
        if (stackTraceLines.length > 0) {
            result.stackTrace = stackTraceLines.join('\n');
        }
        
        return result;
    }

    extractUniqueValues() {
        this.allLoggers.clear();
        this.allProcesses.clear();
        this.allLevels.clear();

        for (const log of this.logs) {
            this.allLoggers.add(log.loggerName);
            this.allLevels.add(log.level);
            
            const processName = log.processPrefix || 'Foreground';
            this.allProcesses.add(processName);
        }

    }

    showMainContent() {
        document.getElementById('upload-section').style.display = 'none';
        document.getElementById('main-content').style.display = 'block';

        this.updateDeviceInfo();
        this.updateTimelineSection();
        this.updateStats();
    }

    updateDeviceInfo() {
        const deviceInfoSection = document.getElementById('device-info-section');
        if (!deviceInfoSection) return;

        const deviceInfoText = document.getElementById('device-info-text');
        const deviceRAMText = document.getElementById('device-ram-text');

        if (deviceInfoText) {
            deviceInfoText.parentElement.style.display = 'none';
        }
        if (deviceRAMText) {
            deviceRAMText.parentElement.style.display = 'none';
        }

        if (this.deviceInfo || this.deviceRAM) {
            if (this.deviceInfo && deviceInfoText) {
                deviceInfoText.textContent = this.deviceInfo;
                deviceInfoText.parentElement.style.display = 'flex';
            }

            if (this.deviceRAM && deviceRAMText) {
                deviceRAMText.textContent = this.deviceRAM;
                deviceRAMText.parentElement.style.display = 'flex';
            }

            deviceInfoSection.style.display = 'flex';
        } else {
            deviceInfoSection.style.display = 'none';
        }
    }

    updateTimelineSection() {
        if (this.logs.length > 0) {
            const timelineSection = document.getElementById('timeline-section');
            timelineSection.style.display = 'block';
            
            const startTime = document.getElementById('start-time');
            const endTime = document.getElementById('end-time');
            
            const minTime = new Date(Math.min(...this.logs.map(log => log.timestamp)));
            const maxTime = new Date(Math.max(...this.logs.map(log => log.timestamp)));
            
            const formatForInput = (date) => {
                return date.toISOString().slice(0, 16);
            };
            
            startTime.min = formatForInput(minTime);
            startTime.max = formatForInput(maxTime);
            startTime.value = formatForInput(minTime);
            
            endTime.min = formatForInput(minTime);
            endTime.max = formatForInput(maxTime);
            endTime.value = formatForInput(maxTime);
        }
    }

    handleSearch(event) {
        const query = event.target.value;
        const clearBtn = document.getElementById('clear-search');
        
        clearBtn.style.display = query ? 'block' : 'none';
        
        this.currentFilter.searchQuery = query;
        this.parseSearchQuery(query);
        this.applyCurrentFilter();
    }

    parseSearchQuery(query) {
        if (!query) {
            this.currentFilter.selectedLoggers.clear();
            return;
        }

        const loggerPattern = /logger:(\S+)/g;
        const matches = [...query.matchAll(loggerPattern)];
        
        if (matches.length > 0) {
            const newLoggers = new Set();
            for (const match of matches) {
                const loggerPattern = match[1];
                if (loggerPattern.endsWith('*')) {
                    const prefix = loggerPattern.slice(0, -1);
                    for (const logger of this.allLoggers) {
                        if (logger.startsWith(prefix)) {
                            newLoggers.add(logger);
                        }
                    }
                } else {
                    newLoggers.add(loggerPattern);
                }
            }
            this.currentFilter.selectedLoggers = newLoggers;
            
            this.currentFilter.searchQuery = query.replace(loggerPattern, '').trim();
        }
    }

    clearSearch() {
        document.getElementById('search-input').value = '';
        document.getElementById('clear-search').style.display = 'none';
        this.currentFilter.searchQuery = '';
        this.currentFilter.selectedLoggers.clear();
        this.applyCurrentFilter();
    }

    applyCurrentFilter() {
        
        this.filteredLogs = this.logs.filter(log => this.matchesFilter(log));
        
        this.filteredLogs.sort((a, b) => {
            if (this.currentFilter.sortNewestFirst) {
                return b.timestamp - a.timestamp;
            } else {
                return a.timestamp - b.timestamp;
            }
        });
        
        this.currentOffset = 0;
        this.renderLogs();
        this.updateStats();
        this.updateActiveFilters();
        this.updateFilterButton();
    }

    matchesFilter(log) {
        if (this.currentFilter.selectedLevels.size > 0) {
            if (!this.currentFilter.selectedLevels.has(log.level)) {
                return false;
            }
        }

        if (this.currentFilter.selectedLoggers.size > 0) {
            if (!this.currentFilter.selectedLoggers.has(log.loggerName)) {
                return false;
            }
        }

        if (this.currentFilter.selectedProcesses.size > 0) {
            const processName = log.processPrefix || 'Foreground';
            if (!this.currentFilter.selectedProcesses.has(processName)) {
                return false;
            }
        }

        if (this.currentFilter.searchQuery) {
            const query = this.currentFilter.searchQuery.toLowerCase();
            const searchText = `${log.message} ${log.loggerName} ${log.error || ''}`.toLowerCase();
            if (!searchText.includes(query)) {
                return false;
            }
        }

        if (this.currentFilter.startTime && log.timestamp < this.currentFilter.startTime) {
            return false;
        }
        if (this.currentFilter.endTime && log.timestamp > this.currentFilter.endTime) {
            return false;
        }

        return true;
    }

    renderLogs() {
        const logList = document.getElementById('log-list');
        const logsToShow = this.filteredLogs.slice(0, this.currentOffset + this.pageSize);
        
        if (logsToShow.length === 0) {
            logList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📝</div>
                    <h3>No logs found</h3>
                    <p>${this.logs.length === 0 ? 'Upload a ZIP file to view logs' : 'Try adjusting your filters'}</p>
                </div>
            `;
            this.setupInfiniteScroll();
            return;
        }

        logList.innerHTML = logsToShow.map(log => this.createLogEntryHTML(log)).join('');
        
        logList.querySelectorAll('.log-entry').forEach((entry, index) => {
            entry.addEventListener('click', () => this.showLogDetail(logsToShow[index]));
        });

        this.currentOffset = logsToShow.length;
        
        const loadMore = document.getElementById('load-more');
        loadMore.style.display = 'none';
        
        this.setupInfiniteScroll();
    }

    setupInfiniteScroll() {
        const logList = document.getElementById('log-list');
        
        if (this.scrollListener) {
            logList.removeEventListener('scroll', this.scrollListener);
        }
        
        this.scrollListener = () => {
            const { scrollTop, scrollHeight, clientHeight } = logList;
            
            if (scrollTop + clientHeight >= scrollHeight * 0.8) {
                this.loadMoreLogs();
            }
        };
        
        logList.addEventListener('scroll', this.scrollListener);
    }

    loadMoreLogs() {
        if (this.isLoadingMore || this.currentOffset >= this.filteredLogs.length) {
            return;
        }
        
        this.isLoadingMore = true;
        
        const loading = document.getElementById('loading');
        loading.style.display = 'block';
        
        setTimeout(() => {
            const logList = document.getElementById('log-list');
            const newLogsToShow = this.filteredLogs.slice(this.currentOffset, this.currentOffset + this.pageSize);
            
            const newLogsHTML = newLogsToShow.map(log => this.createLogEntryHTML(log)).join('');
            logList.insertAdjacentHTML('beforeend', newLogsHTML);
            
            const newEntries = logList.querySelectorAll('.log-entry:nth-last-child(-n+' + newLogsToShow.length + ')');
            newEntries.forEach((entry, index) => {
                const logIndex = this.currentOffset + index;
                entry.addEventListener('click', () => this.showLogDetail(this.filteredLogs[logIndex]));
            });
            
            this.currentOffset += newLogsToShow.length;
            this.isLoadingMore = false;
            loading.style.display = 'none';
            
        }, 100);
    }

    createLogEntryHTML(log, isHighlighted = false) {
        const levelClass = log.level.toLowerCase();
        const processDisplay = this.getProcessDisplayName(log.processPrefix);
        const formattedTime = this.formatTime(log.timestamp);
        const truncatedMessage = this.truncateMessage(log.message);
        const highlightClass = isHighlighted ? 'highlighted' : '';
        
        return `
            <div class="log-entry ${levelClass} ${highlightClass}" data-level="${log.level}">
                <div class="log-level ${log.level}"></div>
                <div class="log-content">
                    <div class="log-header">
                        <span class="log-time">${formattedTime}</span>
                        <span class="log-logger">${log.loggerName}</span>
                        ${processDisplay !== 'Foreground' ? `<span class="log-process">${processDisplay}</span>` : ''}
                        ${isHighlighted ? '<span class="material-icons highlight-icon">my_location</span>' : ''}
                    </div>
                    <div class="log-message">${this.escapeHtml(truncatedMessage)}</div>
                    ${log.error ? `<div class="log-error">${this.escapeHtml(log.error)}</div>` : ''}
                </div>
            </div>
        `;
    }

    getProcessDisplayName(processPrefix) {
        if (!processPrefix) return 'Foreground';
        
        const cleanPrefix = processPrefix.replace(/[\[\]]/g, '');
        switch (cleanPrefix) {
            case 'bg': return 'Background';
            case 'fbg': return 'Firebase Background';
            default: return cleanPrefix || 'Foreground';
        }
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');
        const millis = date.getMilliseconds().toString().padStart(3, '0');
        return `${hours}:${minutes}:${seconds}.${millis}`;
    }

    truncateMessage(message) {
        const lines = message.split('\n');
        const maxLines = 4;
        
        if (lines.length <= maxLines) {
            return message;
        }
        
        return lines.slice(0, maxLines).join('\n') + '...';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    updateStats() {
        const logCount = document.getElementById('log-count');
        const filteredCount = document.getElementById('filtered-count');
        
        logCount.textContent = `${this.logs.length} logs loaded`;
        
        if (this.filteredLogs.length !== this.logs.length) {
            filteredCount.textContent = `(${this.filteredLogs.length} shown)`;
            filteredCount.style.display = 'inline';
        } else {
            filteredCount.style.display = 'none';
        }
    }

    updateActiveFilters() {
        const activeFilters = document.getElementById('active-filters');
        const filterChips = document.getElementById('filter-chips');
        
        const chips = [];
        
        for (const level of this.currentFilter.selectedLevels) {
            chips.push(`<span class="filter-chip level-${level}">${level} <span class="remove" onclick="logViewer.removeFilter('level', '${level}')">✕</span></span>`);
        }
        
        for (const logger of this.currentFilter.selectedLoggers) {
            chips.push(`<span class="filter-chip">${logger} <span class="remove" onclick="logViewer.removeFilter('logger', '${logger}')">✕</span></span>`);
        }
        
        for (const process of this.currentFilter.selectedProcesses) {
            const displayName = this.getProcessDisplayName(process);
            chips.push(`<span class="filter-chip">${displayName} <span class="remove" onclick="logViewer.removeFilter('process', '${process}')">✕</span></span>`);
        }
        
        if (chips.length > 0) {
            filterChips.innerHTML = chips.join('');
            activeFilters.style.display = 'block';
        } else {
            activeFilters.style.display = 'none';
        }
    }

    removeFilter(type, value) {
        switch (type) {
            case 'level':
                this.currentFilter.selectedLevels.delete(value);
                break;
            case 'logger':
                this.currentFilter.selectedLoggers.delete(value);
                break;
            case 'process':
                this.currentFilter.selectedProcesses.delete(value);
                break;
        }
        this.applyCurrentFilter();
    }

    updateFilterButton() {
        const filterCount = document.getElementById('filter-count');
        const totalActiveFilters = this.currentFilter.selectedLevels.size + 
                                 this.currentFilter.selectedLoggers.size + 
                                 this.currentFilter.selectedProcesses.size;
        
        if (totalActiveFilters > 0) {
            filterCount.textContent = totalActiveFilters;
            filterCount.style.display = 'flex';
        } else {
            filterCount.style.display = 'none';
        }
    }

    showFilterDialog() {
        this.populateFilterDialog();
        document.getElementById('filter-dialog').style.display = 'flex';
    }

    hideFilterDialog() {
        document.getElementById('filter-dialog').style.display = 'none';
    }

    populateFilterDialog() {
        const levelChips = document.getElementById('level-chips');
        const levels = ['FINEST', 'FINER', 'FINE', 'CONFIG', 'INFO', 'WARNING', 'SEVERE', 'SHOUT'];
        
        levelChips.innerHTML = levels.map(level => {
            const active = this.currentFilter.selectedLevels.has(level) ? 'active' : '';
            return `<div class="level-chip ${level} ${active}" data-level="${level}">${level}</div>`;
        }).join('');
        
        levelChips.querySelectorAll('.level-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                chip.classList.toggle('active');
            });
        });

        const processList = document.getElementById('process-list');
        const processes = Array.from(this.allProcesses).sort();
        
        processList.innerHTML = processes.map(process => {
            const checked = this.currentFilter.selectedProcesses.has(process) ? 'checked' : '';
            const displayName = this.getProcessDisplayName(process);
            return `
                <div class="checkbox-item">
                    <input type="checkbox" id="process-${process}" ${checked}>
                    <label for="process-${process}">${displayName}</label>
                </div>
            `;
        }).join('');

        const loggerList = document.getElementById('logger-list');
        const loggers = Array.from(this.allLoggers).sort();
        
        loggerList.innerHTML = loggers.map(logger => {
            const checked = this.currentFilter.selectedLoggers.has(logger) ? 'checked' : '';
            return `
                <div class="checkbox-item">
                    <input type="checkbox" id="logger-${logger}" ${checked}>
                    <label for="logger-${logger}">${logger}</label>
                </div>
            `;
        }).join('');
    }

    applyFilters() {
        const selectedLevels = new Set();
        document.querySelectorAll('.level-chip.active').forEach(chip => {
            selectedLevels.add(chip.dataset.level);
        });
        
        const selectedProcesses = new Set();
        document.querySelectorAll('#process-list input:checked').forEach(checkbox => {
            const process = checkbox.id.replace('process-', '');
            selectedProcesses.add(process);
        });
        
        const selectedLoggers = new Set();
        document.querySelectorAll('#logger-list input:checked').forEach(checkbox => {
            const logger = checkbox.id.replace('logger-', '');
            selectedLoggers.add(logger);
        });
        
        this.currentFilter.selectedLevels = selectedLevels;
        this.currentFilter.selectedProcesses = selectedProcesses;
        this.currentFilter.selectedLoggers = selectedLoggers;
        
        this.applyCurrentFilter();
        this.hideFilterDialog();
    }

    clearAllFilters() {
        this.currentFilter.selectedLevels.clear();
        this.currentFilter.selectedProcesses.clear();
        this.currentFilter.selectedLoggers.clear();
        this.currentFilter.searchQuery = '';
        this.currentFilter.startTime = null;
        this.currentFilter.endTime = null;
        
        document.getElementById('search-input').value = '';
        document.getElementById('clear-search').style.display = 'none';
        
        this.applyCurrentFilter();
        this.hideFilterDialog();
    }

    toggleSort() {
        this.currentFilter.sortNewestFirst = !this.currentFilter.sortNewestFirst;
        const sortBtn = document.getElementById('sort-btn');
        const iconElement = sortBtn.querySelector('.material-icons');
        if (iconElement) {
            iconElement.textContent = this.currentFilter.sortNewestFirst ? 'arrow_downward' : 'arrow_upward';
        } else {
            sortBtn.textContent = this.currentFilter.sortNewestFirst ? '↓' : '↑';
        }
        sortBtn.title = this.currentFilter.sortNewestFirst ? 'Sort oldest first' : 'Sort newest first';
        this.applyCurrentFilter();
    }

    toggleTimeline() {
        const timelineControls = document.getElementById('timeline-controls');
        const timelineBtn = document.getElementById('timeline-toggle');
        
        const isVisible = timelineControls.style.display === 'block';
        timelineControls.style.display = isVisible ? 'none' : 'block';
        timelineBtn.style.background = isVisible ? 'none' : '#e3f2fd';
    }

    handleTimelineChange() {
        const startTime = document.getElementById('start-time');
        const endTime = document.getElementById('end-time');
        
        if (startTime.value && endTime.value) {
            this.currentFilter.startTime = new Date(startTime.value);
            this.currentFilter.endTime = new Date(endTime.value);
            this.applyCurrentFilter();
        }
    }

    resetTimeline() {
        if (this.logs.length > 0) {
            const minTime = new Date(Math.min(...this.logs.map(log => log.timestamp)));
            const maxTime = new Date(Math.max(...this.logs.map(log => log.timestamp)));
            
            const formatForInput = (date) => date.toISOString().slice(0, 16);
            
            document.getElementById('start-time').value = formatForInput(minTime);
            document.getElementById('end-time').value = formatForInput(maxTime);
            
            this.currentFilter.startTime = null;
            this.currentFilter.endTime = null;
            this.applyCurrentFilter();
        }
    }

    showLogDetail(log) {
        const detailContent = document.getElementById('detail-content');
        
        const formatTimestamp = (timestamp) => {
            return new Date(timestamp).toISOString().replace('T', ' ').replace('Z', '');
        };
        
        detailContent.innerHTML = `
            <div class="log-detail">
                <h3>Log Entry Details</h3>
                <table class="log-detail-table">
                    <tr><th>Timestamp</th><td>${formatTimestamp(log.timestamp)}</td></tr>
                    <tr><th>Level</th><td><span class="level-chip ${log.level} active">${log.level}</span></td></tr>
                    <tr><th>Logger</th><td>${log.loggerName}</td></tr>
                    <tr><th>Process</th><td>${this.getProcessDisplayName(log.processPrefix)}</td></tr>
                    ${log.filename ? `<tr><th>File</th><td>${log.filename}</td></tr>` : ''}
                    ${log.id ? `<tr><th>ID</th><td style="font-family: monospace;">${log.id}</td></tr>` : ''}
                </table>
                
                <h4>Message</h4>
                <pre class="log-detail-message">${this.escapeHtml(log.message)}</pre>
                
                ${log.error ? `
                    <h4 class="log-detail-error-heading">Error</h4>
                    <pre class="log-detail-error">${this.escapeHtml(log.error)}</pre>
                ` : ''}
                
                ${log.stackTrace ? `
                    <h4 class="log-detail-error-heading">Stack Trace</h4>
                    <pre class="log-detail-stack-trace">${this.escapeHtml(log.stackTrace)}</pre>
                ` : ''}
            </div>
        `;
        
        document.getElementById('detail-dialog').style.display = 'flex';
        this.currentDetailLog = log;
    }

    hideDetailDialog() {
        document.getElementById('detail-dialog').style.display = 'none';
        this.currentDetailLog = null;
    }

    copyLogDetail() {
        if (this.currentDetailLog) {
            const logText = this.formatLogForExport(this.currentDetailLog);
            navigator.clipboard.writeText(logText).then(() => {
                const btn = document.getElementById('copy-log');
                const originalText = btn.textContent;
                btn.textContent = 'Copied!';
                setTimeout(() => {
                    btn.textContent = originalText;
                }, 1000);
            });
        }
    }

    showLogContext() {
        if (this.currentDetailLog) {
            this.isContextMode = true;
            this.contextTargetLog = this.currentDetailLog;
            
            const targetIndex = this.logs.findIndex(log => 
                log.timestamp === this.contextTargetLog.timestamp && 
                log.message === this.contextTargetLog.message
            );
            
            if (targetIndex !== -1) {
                const contextSize = 50;
                const startIndex = Math.max(0, targetIndex - contextSize);
                const endIndex = Math.min(this.logs.length, targetIndex + contextSize + 1);
                
                this.contextLogs = this.logs.slice(startIndex, endIndex);
                
                this.updateContextModeUI();
                this.displayContextLogs();
                
                this.hideDetailDialog();
            }
        }
    }

    updateContextModeUI() {
        const headerTitle = document.querySelector('.header-content h1');
        const searchSection = document.querySelector('.search-section');
        const timelineSection = document.getElementById('timeline-section');
        const activeFilters = document.getElementById('active-filters');
        
        if (this.isContextMode) {
            headerTitle.innerHTML = `
                <div class="context-header">
                    <span class="material-icons">timeline</span>
                    <span>Log Context - ${new Date(this.contextTargetLog.timestamp).toISOString().replace('T', ' ').slice(0, 19)}</span>
                    <button id="exit-context" class="mui-button secondary" style="margin-left: 16px;">
                        <span class="material-icons">close</span>
                        Exit Context
                    </button>
                </div>
            `;
            
            document.getElementById('exit-context').addEventListener('click', this.exitContextMode.bind(this));
            searchSection.style.display = 'none';
            timelineSection.style.display = 'none';
            activeFilters.style.display = 'none';
        } else {
            headerTitle.textContent = '📋 Ente Log Viewer';
            searchSection.style.display = 'block';
            timelineSection.style.display = this.logs.length > 0 ? 'block' : 'none';
        }
    }

    displayContextLogs() {
        const logList = document.getElementById('log-list');
        const targetIndex = this.contextLogs.findIndex(log => 
            log.timestamp === this.contextTargetLog.timestamp && 
            log.message === this.contextTargetLog.message
        );
        
        logList.innerHTML = this.contextLogs.map((log, index) => {
            const isTarget = index === targetIndex;
            const entryHtml = this.createLogEntryHTML(log, isTarget);
            return entryHtml;
        }).join('');
        
        logList.querySelectorAll('.log-entry').forEach((entry, index) => {
            entry.addEventListener('click', () => this.showLogDetail(this.contextLogs[index]));
        });
        
        if (targetIndex !== -1) {
            const targetEntry = logList.children[targetIndex];
            if (targetEntry) {
                targetEntry.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
        
        const logCount = document.getElementById('log-count');
        logCount.textContent = `Showing context: ${this.contextLogs.length} logs around target`;
    }

    exitContextMode() {
        this.isContextMode = false;
        this.contextTargetLog = null;
        this.contextLogs = [];
        
        this.updateContextModeUI();
        this.displayLogs();
    }

    showAnalytics() {
        const analyticsContent = document.getElementById('analytics-content');
        
        const loggerStats = this.calculateLoggerStats();
        const levelStats = this.calculateLevelStats();
        
        analyticsContent.innerHTML = `
            <div class="analytics-chart">
                <h3>Top Loggers</h3>
                ${loggerStats.slice(0, 10).map(stat => `
                    <div class="chart-item" onclick="logViewer.filterByLogger('${stat.name}')">
                        <div class="chart-bar" style="width: ${stat.percentage}%"></div>
                        <span class="chart-label">${stat.name}</span>
                        <span class="chart-count">${stat.count}</span>
                        <span class="chart-percentage">${stat.percentage.toFixed(1)}%</span>
                    </div>
                `).join('')}
            </div>
            
            <div class="analytics-chart">
                <h3>Log Levels</h3>
                ${levelStats.map(stat => `
                    <div class="chart-item" onclick="logViewer.filterByLevel('${stat.name}')">
                        <div class="chart-bar" style="width: ${stat.percentage}%; background: ${this.getLevelColor(stat.name)}"></div>
                        <span class="chart-label">${stat.name}</span>
                        <span class="chart-count">${stat.count}</span>
                        <span class="chart-percentage">${stat.percentage.toFixed(1)}%</span>
                    </div>
                `).join('')}
            </div>
        `;
        
        document.getElementById('analytics-dialog').style.display = 'flex';
    }

    calculateLoggerStats() {
        const loggerCounts = {};
        for (const log of this.filteredLogs) {
            loggerCounts[log.loggerName] = (loggerCounts[log.loggerName] || 0) + 1;
        }
        
        const total = this.filteredLogs.length;
        return Object.entries(loggerCounts)
            .map(([name, count]) => ({ name, count, percentage: (count / total) * 100 }))
            .sort((a, b) => b.count - a.count);
    }

    calculateLevelStats() {
        const levelCounts = {};
        for (const log of this.filteredLogs) {
            levelCounts[log.level] = (levelCounts[log.level] || 0) + 1;
        }
        
        const total = this.filteredLogs.length;
        return Object.entries(levelCounts)
            .map(([name, count]) => ({ name, count, percentage: (count / total) * 100 }))
            .sort((a, b) => b.count - a.count);
    }

    getLevelColor(level) {
        switch (level) {
            case 'SEVERE': return '#f44336';
            case 'WARNING': return '#ff9800';
            case 'INFO': return '#2196f3';
            case 'CONFIG': return '#4caf50';
            case 'FINE':
            case 'FINER':
            case 'FINEST': return '#9e9e9e';
            case 'SHOUT': return '#9c27b0';
            default: return '#9e9e9e';
        }
    }

    filterByLogger(loggerName) {
        this.hideAnalytics();
        document.getElementById('search-input').value = `logger:${loggerName}`;
        this.handleSearch({ target: { value: `logger:${loggerName}` } });
    }

    filterByLevel(level) {
        this.hideAnalytics();
        this.currentFilter.selectedLevels.clear();
        this.currentFilter.selectedLevels.add(level);
        this.applyCurrentFilter();
    }

    hideAnalytics() {
        document.getElementById('analytics-dialog').style.display = 'none';
    }

    exportLogs() {
        const filteredData = this.filteredLogs.map(log => this.formatLogForExport(log)).join('\n\n');
        const header = `=== Ente App Logs ===
Exported at: ${new Date().toISOString()}
Total logs: ${this.filteredLogs.length}
${'='.repeat(40)}\n\n`;
        
        const content = header + filteredData;
        this.downloadFile(content, 'ente-logs.txt', 'text/plain');
    }

    formatLogForExport(log) {
        let text = `[${new Date(log.timestamp).toISOString()}] [${log.loggerName}] [${log.level}]\n${log.message}`;
        
        if (log.error) {
            text += `\nError: ${log.error}`;
        }
        
        if (log.stackTrace) {
            text += `\nStack trace:\n${log.stackTrace}`;
        }
        
        return text;
    }

    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    clearLogs() {
        if (confirm('Are you sure you want to clear all logs? This will reload the page.')) {
            location.reload();
        }
    }
}

const logViewer = new LogViewer();
