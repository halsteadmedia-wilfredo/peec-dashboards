/**
 * Peec.ai → Google Sheets Integration
 * Weekly AI Visibility Data Pull
 *
 * Client: 1st Impressions
 * Purpose: Internal testing only (NOT client-facing)
 */

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  API_KEY: 'skc-Y29fOTVhNzdlOGItY2E5MS00MTQ2LTg0Y2QtYTMwYWY1M2YwZGM1-n1A-irLFGRWKQIkYpBS-6Q',
  PROJECT_ID: 'or_33ba58ef-0844-48be-aeb1-42ee2a86604e',
  BASE_URL: 'https://api.peec.ai/customer/v1',
  CLIENT_NAME: "1st Impressions",
  CLIENT_BRAND_ID: 'kw_b258f5af-b6da-431c-ac1d-99d52a66ade1',
  SHEET_NAME: 'peec_weekly',
  SPREADSHEET_ID: '1GUnTa18-ZiT5ANt4EsUiSN01W2c7adCTuGAomdJneQc'
};

// Model ID to friendly name mapping
const MODEL_NAMES = {
  'chatgpt-scraper': 'ChatGPT',
  'gemini-scraper': 'Gemini',
  'google-ai-overview-scraper': 'Google AI Overview',
  'perplexity-scraper': 'Perplexity',
  'gpt-4o': 'GPT-4o',
  'gpt-4o-search': 'GPT-4o Search',
  'claude-sonnet-4': 'Claude',
  'claude-3.5-haiku': 'Claude Haiku'
};

// ============================================
// MAIN FUNCTION - Run this weekly
// ============================================

function pullPeecDataWeekly() {
  try {
    Logger.log('Starting Peec data pull...');

    // Get date range (last 14 days — matches Peec.ai dashboard's default window)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 14);

    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(endDate);

    Logger.log(`Date range: ${startDateStr} to ${endDateStr}`);

    // Fetch prompts first (to get prompt text)
    const prompts = fetchPrompts();
    const promptMap = createPromptMap(prompts);
    Logger.log(`Fetched ${Object.keys(promptMap).length} prompts`);

    // Fetch brands (to identify competitors)
    const brands = fetchBrands();
    const brandMap = createBrandMap(brands);
    Logger.log(`Fetched ${Object.keys(brandMap).length} brands`);

    // Fetch brands report (day by day to get date breakdown)
    const reportData = fetchBrandsReportByDay(startDateStr, endDateStr);
    Logger.log(`Fetched ${reportData.length} total report entries`);

    // Transform data for sheet
    const rows = transformDataForSheet(reportData, promptMap, brandMap, startDateStr);
    Logger.log(`Transformed into ${rows.length} rows`);

    // Write to main data sheet
    writeToSheet(rows);

    // Write AA dashboard tabs
    writeSummarySheet(reportData, startDateStr, endDateStr);
    writeBrandsSheet(reportData, brandMap);
    writeDailySheet(reportData, startDateStr, endDateStr);
    writePromptSheet(reportData, promptMap);
    writeModelSheet(reportData);

    // Invalidate dashboard cache so next iframe load gets fresh data
    try { clearDashboardCache(); } catch (e) { Logger.log('Cache clear skipped: ' + e); }

    Logger.log('Peec data pull completed successfully!');

  } catch (error) {
    Logger.log('Error: ' + error.message);
    throw error;
  }
}

// ============================================
// API FETCH FUNCTIONS
// ============================================

function fetchPrompts() {
  const url = `${CONFIG.BASE_URL}/prompts?project_id=${CONFIG.PROJECT_ID}`;
  const response = makeApiRequest(url, 'GET');
  return response.data || [];
}

function fetchBrands() {
  const url = `${CONFIG.BASE_URL}/brands?project_id=${CONFIG.PROJECT_ID}`;
  const response = makeApiRequest(url, 'GET');
  return response.data || [];
}

function fetchBrandsReport(startDate, endDate) {
  const url = `${CONFIG.BASE_URL}/reports/brands`;
  const payload = {
    project_id: CONFIG.PROJECT_ID,
    limit: 10000,
    offset: 0,
    start_date: startDate,
    end_date: endDate,
    dimensions: ['prompt_id', 'model_id']  // 'date' not supported by API
  };

  const response = makeApiRequest(url, 'POST', payload);
  return response.data || [];
}

// Fetch data for each day in the range
function fetchBrandsReportByDay(startDate, endDate) {
  const allData = [];

  // Parse dates properly to avoid timezone issues
  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = endDate.split('-').map(Number);

  const start = new Date(startYear, startMonth - 1, startDay);
  const end = new Date(endYear, endMonth - 1, endDay);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = formatDate(d);
    Logger.log(`Fetching data for ${dateStr}...`);

    const url = `${CONFIG.BASE_URL}/reports/brands`;
    const payload = {
      project_id: CONFIG.PROJECT_ID,
      limit: 10000,
      offset: 0,
      start_date: dateStr,
      end_date: dateStr,  // Same day
      dimensions: ['prompt_id', 'model_id']
    };

    try {
      const response = makeApiRequest(url, 'POST', payload);
      const data = response.data || [];
      // Add date to each entry
      data.forEach(entry => entry.date = dateStr);
      allData.push(...data);
    } catch (e) {
      Logger.log(`Warning: Failed to fetch data for ${dateStr}: ${e.message}`);
    }
  }

  return allData;
}

function makeApiRequest(url, method, payload) {
  const options = {
    method: method,
    headers: {
      'x-api-key': CONFIG.API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    muteHttpExceptions: true
  };

  if (payload) {
    options.payload = JSON.stringify(payload);
  }

  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();

  if (responseCode !== 200) {
    throw new Error(`API request failed with status ${responseCode}: ${response.getContentText()}`);
  }

  return JSON.parse(response.getContentText());
}

// ============================================
// DATA TRANSFORMATION
// ============================================

function createPromptMap(prompts) {
  const map = {};
  prompts.forEach(p => {
    if (p.messages && p.messages.length > 0) {
      map[p.id] = p.messages[0].content;
    }
  });
  return map;
}

function createBrandMap(brands) {
  const map = {};
  brands.forEach(b => {
    map[b.id] = b.name;
  });
  return map;
}

function transformDataForSheet(reportData, promptMap, brandMap, weekStartDate) {
  const rows = [];

  // Group data by date + prompt + model to get Hiner data + competitors
  const groupedData = {};

  reportData.forEach(entry => {
    const promptId = entry.prompt?.id;
    const modelId = entry.model?.id;
    const brandId = entry.brand?.id;
    const brandName = entry.brand?.name;
    const entryDate = entry.date || 'unknown';  // Get date from API response (자료날짜)

    if (!promptId || !modelId) return;

    const key = `${entryDate}|${promptId}|${modelId}`;

    if (!groupedData[key]) {
      groupedData[key] = {
        date: entryDate,  // Store the date
        promptId: promptId,
        promptText: promptMap[promptId] || promptId,
        modelId: modelId,
        modelName: MODEL_NAMES[modelId] || modelId,
        hinerData: null,
        competitors: []
      };
    }

    const brandData = {
      name: brandName,
      visibility: entry.visibility || 0,
      position: entry.position || null,
      sentiment: entry.sentiment || null
    };

    if (brandId === CONFIG.CLIENT_BRAND_ID) {
      groupedData[key].hinerData = brandData;
    } else {
      groupedData[key].competitors.push(brandData);
    }
  });

  // Convert grouped data to rows
  Object.values(groupedData).forEach(group => {
    // Only include rows where we have data (either Hiner or competitors)
    const hiner = group.hinerData;
    const competitors = group.competitors
      .filter(c => c.visibility > 0)
      .sort((a, b) => (a.position || 999) - (b.position || 999));

    // Format competitors list
    const competitorsList = competitors
      .map(c => c.name)
      .slice(0, 5)  // Top 5 competitors
      .join(', ');

    rows.push([
      weekStartDate,                                    // week_start_date (주시작날짜)
      group.date,                                       // date (자료날짜)
      CONFIG.CLIENT_NAME,                               // client_name
      group.modelName,                                  // model
      group.promptText,                                 // prompt
      hiner && hiner.visibility > 0 ? 'YES' : 'NO',   // brand_mentioned
      hiner ? Math.round(hiner.position * 10) / 10 : '', // brand_rank_position
      competitorsList || ''                             // competitors_mentioned
    ]);
  });

  // Sort by date, then model, then prompt
  rows.sort((a, b) => {
    if (a[1] !== b[1]) return a[1].localeCompare(b[1]);  // date (index 1)
    if (a[3] !== b[3]) return a[3].localeCompare(b[3]);  // model (index 3)
    return a[4].localeCompare(b[4]);                      // prompt (index 4)
  });

  return rows;
}

// ============================================
// SHEET OPERATIONS
// ============================================

function writeToSheet(rows) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  // Create sheet if it doesn't exist
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);

    // Add header row
    const headers = [
      'week_start_date',
      'date',
      'client_name',
      'model',
      'prompt',
      'brand_mentioned',
      'brand_rank_position',
      'competitors_mentioned'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }

  if (rows.length === 0) {
    Logger.log('No data to write');
    return;
  }

  // Append new data
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, rows.length, rows[0].length).setValues(rows);

  Logger.log(`Wrote ${rows.length} rows to sheet`);
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ============================================
// AA DASHBOARD SHEETS
// ============================================

/**
 * peec_summary tab - KPI cards data for AA
 */
function writeSummarySheet(reportData, startDate, endDate) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('peec_summary');

  if (!sheet) {
    sheet = ss.insertSheet('peec_summary');
  }
  sheet.clear();

  // Calculate KPIs from Hiner data only
  let totalVisibility = 0;
  let totalPosition = 0;
  let totalSentiment = 0;
  let hinerCount = 0;
  let positionCount = 0;
  let sentimentCount = 0;
  let mentionedCount = 0;
  let totalEntries = 0;
  const promptIds = new Set();

  reportData.forEach(entry => {
    if (entry.brand?.id === CONFIG.CLIENT_BRAND_ID) {
      totalVisibility += entry.visibility || 0;
      if (entry.position)  { totalPosition  += entry.position;  positionCount++;  }
      if (entry.sentiment) { totalSentiment += entry.sentiment; sentimentCount++; }
      hinerCount++;
      if (entry.visibility > 0) mentionedCount++;
    }
    if (entry.prompt?.id) promptIds.add(entry.prompt.id);
    totalEntries++;
  });

  // Position/sentiment averaged ONLY over entries where the value exists, matching Peec's dashboard.
  // Dividing by hinerCount (all entries) dilutes the average toward 0 — that was the original bug.
  const avgVisibility = hinerCount     > 0 ? Math.round(totalVisibility / hinerCount     * 10000) / 100 : 0;  // 0.0094 → 0.94
  const avgPosition   = positionCount  > 0 ? Math.round(totalPosition   / positionCount  * 10)    / 10  : 0;
  const avgSentiment  = sentimentCount > 0 ? Math.round(totalSentiment  / sentimentCount * 10)    / 10  : 0;
  const mentionRate   = hinerCount     > 0 ? Math.round(mentionedCount  / hinerCount     * 100)         : 0;  // 42

  // Row 1: Labels, Row 2: Values (clean numbers, NO % signs to avoid Sheets auto-conversion)
  const labels = ['Overall Visibility', 'Avg Position', 'Sentiment Score', 'Active Prompts', 'Mention Rate', 'Period'];
  const values = [avgVisibility, avgPosition, avgSentiment, promptIds.size, mentionRate, startDate + ' ~ ' + endDate];

  sheet.getRange(1, 1, 1, labels.length).setValues([labels]);
  // Set number format BEFORE writing to prevent Sheets from auto-interpreting integers as dates
  sheet.getRange(2, 1, 1, 5).setNumberFormat('#,##0.##');  // Columns 1-5: numbers
  sheet.getRange(2, 6, 1, 1).setNumberFormat('@');          // Column 6: text (period string)
  sheet.getRange(2, 1, 1, values.length).setValues([values]);
  sheet.getRange(1, 1, 1, labels.length).setFontWeight('bold');

  Logger.log('Wrote peec_summary sheet');
}

/**
 * peec_brands tab - Brand rankings for AA
 */
function writeBrandsSheet(reportData, brandMap) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('peec_brands');

  if (!sheet) {
    sheet = ss.insertSheet('peec_brands');
  }
  sheet.clear();

  // Aggregate by brand
  const brandStats = {};

  reportData.forEach(entry => {
    const brandId = entry.brand?.id;
    const brandName = entry.brand?.name;
    if (!brandId || !brandName) return;

    if (!brandStats[brandId]) {
      brandStats[brandId] = {
        name: brandName,
        isClient: brandId === CONFIG.CLIENT_BRAND_ID,
        totalVisibility: 0,
        totalPosition: 0,
        totalSentiment: 0,
        positionCount: 0,
        sentimentCount: 0,
        count: 0
      };
    }

    brandStats[brandId].totalVisibility += entry.visibility || 0;
    if (entry.position)  { brandStats[brandId].totalPosition  += entry.position;  brandStats[brandId].positionCount++;  }
    if (entry.sentiment) { brandStats[brandId].totalSentiment += entry.sentiment; brandStats[brandId].sentimentCount++; }
    brandStats[brandId].count++;
  });

  // Sort by avg visibility descending
  const sorted = Object.values(brandStats).sort((a, b) => {
    return (b.totalVisibility / b.count) - (a.totalVisibility / a.count);
  });

  const headers = ['rank', 'brand', 'type', 'visibility_pct', 'avg_position', 'avg_sentiment'];
  const rows = [headers];

  // avg_position/avg_sentiment divided by their own counts (not total entries)
  // to match Peec's "average when ranked/scored" semantics.
  sorted.forEach((brand, i) => {
    rows.push([
      i + 1,
      brand.name,
      brand.isClient ? 'You' : 'Competitor',
      brand.count          > 0 ? Math.round(brand.totalVisibility / brand.count          * 10000) / 100 : 0,  // 0.0096 → 0.96
      brand.positionCount  > 0 ? Math.round(brand.totalPosition   / brand.positionCount  * 10)    / 10  : 0,
      brand.sentimentCount > 0 ? Math.round(brand.totalSentiment  / brand.sentimentCount * 10)    / 10  : 0
    ]);
  });

  sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  // Set number formats on data rows to prevent auto-date-conversion
  if (rows.length > 1) {
    sheet.getRange(2, 1, rows.length - 1, 1).setNumberFormat('0');       // rank: integer
    sheet.getRange(2, 2, rows.length - 1, 1).setNumberFormat('@');       // brand: text
    sheet.getRange(2, 3, rows.length - 1, 1).setNumberFormat('@');       // type: text
    sheet.getRange(2, 4, rows.length - 1, 3).setNumberFormat('#,##0.##'); // vis, pos, sentiment: numbers
  }

  Logger.log(`Wrote peec_brands sheet (${sorted.length} brands)`);
}

/**
 * peec_daily tab - Daily mention rates for AA chart
 */
function writeDailySheet(reportData, startDate, endDate) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('peec_daily');

  if (!sheet) {
    sheet = ss.insertSheet('peec_daily');
  }
  sheet.clear();

  // Group by date, count mentions vs total for Hiner
  const dailyData = {};

  reportData.forEach(entry => {
    const entryDate = entry.date;
    if (!entryDate || entry.brand?.id !== CONFIG.CLIENT_BRAND_ID) return;

    if (!dailyData[entryDate]) {
      dailyData[entryDate] = { total: 0, mentioned: 0, totalVisibility: 0, totalPosition: 0, positionCount: 0 };
    }

    // totalVisibility sums ALL entries (including 0) so the daily mean reflects all checks,
    // matching Peec's "Overall Visibility" semantics. mentioned tracks brand-was-ranked count separately.
    dailyData[entryDate].total++;
    dailyData[entryDate].totalVisibility += entry.visibility || 0;
    if (entry.visibility > 0) {
      dailyData[entryDate].mentioned++;
    }
    if (entry.position) {
      dailyData[entryDate].totalPosition += entry.position;
      dailyData[entryDate].positionCount++;
    }
  });

  const headers = ['date', 'mention_rate', 'mentions', 'total_checks', 'avg_visibility', 'avg_position'];
  const rows = [headers];

  // Peec's API sometimes returns incomplete daily batches. If we used per-day total as the
  // mention_rate denominator, partial days (e.g. total=1, mentioned=1) would show a misleading
  // 100%. Normalize against the largest observed daily total — treat that as the expected
  // (prompts × models) batch size for the client brand.
  const expectedDailyTotal = Math.max(0, ...Object.values(dailyData).map(d => d.total));

  Object.keys(dailyData).sort().forEach(date => {
    const d = dailyData[date];
    rows.push([
      date,
      expectedDailyTotal > 0 ? Math.round(d.mentioned / expectedDailyTotal * 100) : 0,            // 73 (NO % string)
      d.mentioned,
      d.total,
      d.total         > 0 ? Math.round(d.totalVisibility / d.total         * 10000) / 100 : 0,    // 0.96 (NO % string)
      d.positionCount > 0 ? Math.round(d.totalPosition   / d.positionCount * 10)    / 10  : 0
    ]);
  });

  sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  // Set number formats on data rows to prevent auto-date-conversion
  if (rows.length > 1) {
    sheet.getRange(2, 1, rows.length - 1, 1).setNumberFormat('@');        // date: text
    sheet.getRange(2, 2, rows.length - 1, 5).setNumberFormat('#,##0.##'); // all numeric columns
  }

  Logger.log(`Wrote peec_daily sheet (${rows.length - 1} days)`);
}

/**
 * peec_prompts tab - Prompt performance for AA table widget
 */
function writePromptSheet(reportData, promptMap) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('peec_prompts');

  if (!sheet) {
    sheet = ss.insertSheet('peec_prompts');
  }
  sheet.clear();

  // Aggregate by prompt (across all models/dates)
  const promptStats = {};

  reportData.forEach(entry => {
    const promptId = entry.prompt?.id;
    if (!promptId || entry.brand?.id !== CONFIG.CLIENT_BRAND_ID) return;

    if (!promptStats[promptId]) {
      promptStats[promptId] = {
        text: promptMap[promptId] || promptId,
        totalVisibility: 0,
        totalPosition: 0,
        totalSentiment: 0,
        mentionCount: 0,
        sentimentCount: 0,
        totalCount: 0,
        models: new Set()
      };
    }

    // totalVisibility sums ALL entries (including 0) so the per-prompt mean reflects all checks
    promptStats[promptId].totalCount++;
    promptStats[promptId].totalVisibility += entry.visibility || 0;
    if (entry.visibility > 0) promptStats[promptId].mentionCount++;
    if (entry.position)       promptStats[promptId].totalPosition += entry.position;
    if (entry.sentiment)    { promptStats[promptId].totalSentiment += entry.sentiment; promptStats[promptId].sentimentCount++; }
    if (entry.model?.id) promptStats[promptId].models.add(MODEL_NAMES[entry.model.id] || entry.model.id);
  });

  // Sort by visibility descending
  const sorted = Object.values(promptStats).sort((a, b) => {
    return (b.totalVisibility / b.totalCount) - (a.totalVisibility / a.totalCount);
  });

  const headers = ['prompt', 'visibility_pct', 'avg_position', 'avg_sentiment', 'mention_rate', 'models'];
  const rows = [headers];

  // avg_sentiment divided by sentimentCount (not totalCount) to avoid diluting toward 0.
  sorted.forEach(p => {
    rows.push([
      p.text,
      p.totalCount     > 0 ? Math.round(p.totalVisibility / p.totalCount     * 10000) / 100 : 0,  // 0.96 (NO % string)
      p.mentionCount   > 0 ? Math.round(p.totalPosition   / p.mentionCount   * 10)    / 10  : 0,
      p.sentimentCount > 0 ? Math.round(p.totalSentiment  / p.sentimentCount * 10)    / 10  : 0,
      p.totalCount     > 0 ? Math.round(p.mentionCount    / p.totalCount     * 100)         : 0,  // 73 (NO % string)
      Array.from(p.models).join(', ')
    ]);
  });

  sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  // Set number formats on data rows to prevent auto-date-conversion
  if (rows.length > 1) {
    sheet.getRange(2, 1, rows.length - 1, 1).setNumberFormat('@');        // prompt text: text
    sheet.getRange(2, 2, rows.length - 1, 4).setNumberFormat('#,##0.##'); // vis, pos, sentiment, mention_rate: numbers
    sheet.getRange(2, 6, rows.length - 1, 1).setNumberFormat('@');        // models: text
  }

  Logger.log(`Wrote peec_prompts sheet (${sorted.length} prompts)`);
}

/**
 * peec_models tab - Per-AI-platform breakdown for AA dashboard
 * Aggregates the client brand's performance across each AI model.
 */
function writeModelSheet(reportData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('peec_models');

  if (!sheet) {
    sheet = ss.insertSheet('peec_models');
  }
  sheet.clear();

  // Aggregate by model_id for the client brand only
  const modelStats = {};

  reportData.forEach(entry => {
    const modelId = entry.model?.id;
    if (!modelId || entry.brand?.id !== CONFIG.CLIENT_BRAND_ID) return;

    if (!modelStats[modelId]) {
      modelStats[modelId] = {
        id: modelId,
        name: MODEL_NAMES[modelId] || modelId,
        totalVisibility: 0,
        totalPosition: 0,
        positionCount: 0,
        mentionCount: 0,
        totalCount: 0
      };
    }
    modelStats[modelId].totalCount++;
    modelStats[modelId].totalVisibility += entry.visibility || 0;
    if (entry.visibility > 0) modelStats[modelId].mentionCount++;
    if (entry.position) {
      modelStats[modelId].totalPosition += entry.position;
      modelStats[modelId].positionCount++;
    }
  });

  // Sort by mention_rate descending so the "strongest" model is first
  const sorted = Object.values(modelStats).sort((a, b) => {
    const aRate = a.totalCount > 0 ? a.mentionCount / a.totalCount : 0;
    const bRate = b.totalCount > 0 ? b.mentionCount / b.totalCount : 0;
    return bRate - aRate;
  });

  const headers = ['model_id', 'model', 'mention_rate', 'visibility_pct', 'avg_position', 'mentions', 'total_checks'];
  const rows = [headers];

  sorted.forEach(m => {
    rows.push([
      m.id,
      m.name,
      m.totalCount    > 0 ? Math.round(m.mentionCount    / m.totalCount    * 100)         : 0,   // 4 (NO % string)
      m.totalCount    > 0 ? Math.round(m.totalVisibility / m.totalCount    * 10000) / 100 : 0,   // 0.96 (NO % string)
      m.positionCount > 0 ? Math.round(m.totalPosition   / m.positionCount * 10)    / 10  : 0,
      m.mentionCount,
      m.totalCount
    ]);
  });

  sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  if (rows.length > 1) {
    sheet.getRange(2, 1, rows.length - 1, 1).setNumberFormat('@');        // model_id: text
    sheet.getRange(2, 2, rows.length - 1, 1).setNumberFormat('@');        // model: text
    sheet.getRange(2, 3, rows.length - 1, 5).setNumberFormat('#,##0.##'); // numeric columns
  }

  Logger.log(`Wrote peec_models sheet (${sorted.length} models)`);
}

// Helper: Convert Date object or ISO string to "YYYY-MM-DD" or "Mon DD" format
function cellToDateStr(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  // If already a string like "2026-02-02" or "2026-02-02T05:00:00.000Z"
  var str = String(val);
  if (str.indexOf('T') > -1) return str.split('T')[0];
  return str;
}

// Helper: Convert cell value to number, handling Sheets Date auto-conversion
// Sheets sometimes interprets small integers (22, 70) as serial dates (Jan 22 1900, Mar 10 1900)
function cellToNumber(val) {
  if (typeof val === 'number') return val;
  if (val instanceof Date) {
    // Sheets serial date epoch = Dec 30, 1899
    var epoch = new Date(1899, 11, 30);
    return Math.round((val.getTime() - epoch.getTime()) / (24 * 60 * 60 * 1000));
  }
  var n = Number(val);
  return isNaN(n) ? 0 : n;
}

// ============================================
// WEB APP - Serves the dashboard HTML
// ============================================

function doGet() {
  return HtmlService.createHtmlOutputFromFile('peec-dashboard')
    .setTitle('AI Visibility Tracking')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Builds a fully self-contained dashboard HTML with the client's data baked in,
 * for hosting OFF script.google.com (static host on a halsteadmedia.com subdomain).
 * Embedding that static URL in AA removes Google's iframe account-routing entirely —
 * the fix for the multi-Google-account "blank dashboard" issue.
 *
 * Run it, then download the file it drops in Drive and host it (Cloudflare Pages /
 * GitHub Pages / GCS). Use that non-Google URL in AA and test with multiple accounts.
 */
function buildStandaloneHtml() {
  var data = getDashboardData();
  var html = HtmlService.createHtmlOutputFromFile('peec-dashboard').getContent(); // raw template, inline CSS/JS
  var inject = '<script>window.__PEEC_DATA__ = ' + JSON.stringify(data) + ';<\/script>';
  html = (html.indexOf('</head>') >= 0)
    ? html.replace('</head>', inject + '\n</head>')   // defined before the body load script runs
    : inject + '\n' + html;

  var name = (CONFIG.CLIENT_NAME || 'client').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-ai-visibility.html';
  var file = DriveApp.createFile(name, html, MimeType.HTML);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  Logger.log('Standalone dashboard built: ' + name + '\nDrive file: ' + file.getUrl() +
             '\nDownload it and host on a non-Google static URL, then embed that in AA.');
  return html;
}

/**
 * Returns all dashboard data from the sheet tabs.
 * Called by the HTML template via google.script.run
 * Cached for 10 minutes via CacheService to avoid sandbox iframe timeouts.
 */
function getDashboardData() {
  const cache = CacheService.getScriptCache();
  // Bumped key to v2 — getDashboardData payload shape now includes `models` and `clientName`
  const cacheKey = 'dashboard_data_v2';
  const cached = cached_getJson(cache, cacheKey);
  if (cached) return cached;

  const ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const data = {
    clientName: CONFIG.CLIENT_NAME,
    clientBrandId: CONFIG.CLIENT_BRAND_ID,
    summary: readSummaryData(ss),
    brands: readBrandsData(ss),
    daily: readDailyData(ss),
    prompts: readPromptsData(ss),
    models: readModelData(ss)
  };

  cached_putJson(cache, cacheKey, data, 600); // 10 minutes
  return data;
}

function cached_getJson(cache, key) {
  try {
    // Cache values are limited to 100KB; chunked storage handles larger payloads.
    const meta = cache.get(key + '_meta');
    if (!meta) return null;
    const chunks = parseInt(meta, 10);
    let combined = '';
    for (let i = 0; i < chunks; i++) {
      const part = cache.get(key + '_' + i);
      if (part === null) return null; // partial expiry, treat as miss
      combined += part;
    }
    return JSON.parse(combined);
  } catch (e) {
    return null;
  }
}

function cached_putJson(cache, key, value, ttlSec) {
  try {
    const json = JSON.stringify(value);
    const chunkSize = 90000; // stay under 100KB CacheService cap
    const chunks = Math.ceil(json.length / chunkSize);
    cache.put(key + '_meta', String(chunks), ttlSec);
    for (let i = 0; i < chunks; i++) {
      cache.put(key + '_' + i, json.substr(i * chunkSize, chunkSize), ttlSec);
    }
  } catch (e) {
    // cache write failure is non-fatal
  }
}

/**
 * Manually clear the dashboard cache. Run after pullPeecDataWeekly to force refresh.
 */
function clearDashboardCache() {
  const cache = CacheService.getScriptCache();
  // Clear both v1 (old) and v2 (current) keys so a redeploy doesn't read a stale shape.
  ['dashboard_data_v1', 'dashboard_data_v2'].forEach(key => {
    const meta = cache.get(key + '_meta');
    if (meta) {
      const chunks = parseInt(meta, 10);
      const keys = [key + '_meta'];
      for (let i = 0; i < chunks; i++) keys.push(key + '_' + i);
      cache.removeAll(keys);
    }
  });
}

function readSummaryData(ss) {
  const sheet = ss.getSheetByName('peec_summary');
  if (!sheet) return null;

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return null;

  var headers = data[0];

  // Old vertical format: metric | value | period_start | period_end
  if (headers[0] === 'metric') {
    var metrics = {};
    var periodStart = '', periodEnd = '';
    for (var i = 1; i < data.length; i++) {
      metrics[String(data[i][0]).trim()] = data[i][1];
      if (!periodStart && data[i][2]) periodStart = cellToDateStr(data[i][2]);
      if (!periodEnd && data[i][3]) periodEnd = cellToDateStr(data[i][3]);
    }
    var vis = metrics['Overall Visibility'] || 0;
    // Old format stores raw Peec decimal (0.0094), convert to percentage (0.94)
    if (typeof vis === 'number' && vis < 0.5) vis = Math.round(vis * 10000) / 100;
    var mr = metrics['Mention Rate'] || 0;
    // Old format might store decimal (0.42 for 42%), convert
    if (typeof mr === 'number' && mr < 1 && mr > 0) mr = Math.round(mr * 100);
    return {
      visibility: vis,
      position: metrics['Avg Position'] || metrics['Average Position'] || 0,
      sentiment: metrics['Sentiment Score'] || metrics['Sentiment'] || 0,
      prompts: metrics['Active Prompts'] || 0,
      mentionRate: mr,
      period: periodStart + ' ~ ' + periodEnd
    };
  }

  // New horizontal format: Row 1=labels, Row 2=clean numbers
  // Values are already in display-ready format (0.94 = 0.94%, 42 = 42%)
  // Use cellToNumber for fields that Sheets might have auto-converted to Date objects
  var values = data[1];
  return {
    visibility: cellToNumber(values[0]),
    position: cellToNumber(values[1]),
    sentiment: cellToNumber(values[2]),
    prompts: cellToNumber(values[3]),
    mentionRate: cellToNumber(values[4]),
    period: values[5] || ''
  };
}

function readBrandsData(ss) {
  const sheet = ss.getSheetByName('peec_brands');
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var results = [];
  for (var i = 1; i < data.length; i++) {
    var vis = data[i][3];
    // New format: clean number (0.96). Old format: Sheets auto-converted (0.0096).
    if (typeof vis === 'number' && vis < 0.5) vis = Math.round(vis * 10000) / 100;
    results.push({
      rank: data[i][0],
      brand: data[i][1],
      type: data[i][2],
      visibility: vis + '%',
      position: cellToNumber(data[i][4]),
      sentiment: cellToNumber(data[i][5])
    });
  }
  return results;
}

function readDailyData(ss) {
  const sheet = ss.getSheetByName('peec_daily');
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var results = [];
  for (var i = 1; i < data.length; i++) {
    var dateVal = data[i][0];
    var mentionRate = data[i][1];
    var avgVis = data[i][4];

    // Convert Date objects to "YYYY-MM-DD" string
    if (dateVal instanceof Date) dateVal = cellToDateStr(dateVal);

    // Old format: Sheets auto-converted "73%" → 0.73. Detect and fix.
    // Use strict `< 1` (not `<= 1`) so new-format value 1 (meaning 1%) is NOT
    // misinterpreted as old-format 1.0 (meaning 100%).
    if (typeof mentionRate === 'number' && mentionRate < 1 && mentionRate > 0) {
      mentionRate = Math.round(mentionRate * 100);
    }
    // Old format: Sheets auto-converted "0.96%" → 0.0096. Detect and fix.
    if (typeof avgVis === 'number' && avgVis < 0.5 && avgVis !== 0) {
      avgVis = Math.round(avgVis * 10000) / 100;
    }

    results.push({
      date: String(dateVal),
      mentionRate: mentionRate + '%',
      mentions: data[i][2],
      totalChecks: data[i][3],
      avgVisibility: avgVis + '%',
      avgPosition: data[i][5]
    });
  }
  return results;
}

function readPromptsData(ss) {
  const sheet = ss.getSheetByName('peec_prompts');
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var results = [];
  for (var i = 1; i < data.length; i++) {
    var vis = data[i][1];
    var mRate = data[i][4];

    // Old format: Sheets auto-converted "0.96%" → 0.0096. Detect and fix.
    if (typeof vis === 'number' && vis < 0.5 && vis !== 0) {
      vis = Math.round(vis * 10000) / 100;
    }
    // Old format: Sheets auto-converted "73%" → 0.73. Detect and fix.
    // Strict `< 1` so new-format 1 (= 1%) is not multiplied to 100.
    if (typeof mRate === 'number' && mRate < 1 && mRate > 0) {
      mRate = Math.round(mRate * 100);
    }

    results.push({
      prompt: data[i][0],
      visibility: vis + '%',
      position: cellToNumber(data[i][2]),
      sentiment: cellToNumber(data[i][3]),
      mentionRate: mRate + '%',
      models: String(data[i][5] || '')
    });
  }
  return results;
}

function readModelData(ss) {
  const sheet = ss.getSheetByName('peec_models');
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var results = [];
  for (var i = 1; i < data.length; i++) {
    var mRate = data[i][2];
    var vis = data[i][3];

    // Defensive: handle old-format fractions if the sheet was written under a previous schema.
    if (typeof mRate === 'number' && mRate < 1 && mRate > 0) {
      mRate = Math.round(mRate * 100);
    }
    if (typeof vis === 'number' && vis < 0.5 && vis !== 0) {
      vis = Math.round(vis * 10000) / 100;
    }

    results.push({
      id: String(data[i][0] || ''),
      name: String(data[i][1] || ''),
      mentionRate: cellToNumber(mRate),
      visibility: cellToNumber(vis),
      position: cellToNumber(data[i][4]),
      mentions: cellToNumber(data[i][5]),
      totalChecks: cellToNumber(data[i][6])
    });
  }
  return results;
}

// ============================================
// TRIGGER SETUP - Run once to set up weekly trigger
// ============================================

function setupWeeklyTrigger() {
  // Delete existing triggers for this function
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'pullPeecDataWeekly') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Create new weekly trigger (every Monday at 9 AM)
  ScriptApp.newTrigger('pullPeecDataWeekly')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(9)
    .create();

  Logger.log('Weekly trigger set up for Monday 9 AM');
}

// ============================================
// MANUAL TEST FUNCTION
// ============================================

function testDashboardData() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    Logger.log('Spreadsheet: ' + ss.getName());

    // Check each sheet tab
    const sheets = ['peec_summary', 'peec_brands', 'peec_daily', 'peec_prompts'];
    sheets.forEach(name => {
      const sheet = ss.getSheetByName(name);
      if (!sheet) {
        Logger.log('✗ Sheet "' + name + '" NOT FOUND');
      } else {
        const rows = sheet.getDataRange().getValues();
        Logger.log('✓ Sheet "' + name + '" has ' + rows.length + ' rows');
        if (rows.length > 0) Logger.log('  Row 1: ' + JSON.stringify(rows[0]));
        if (rows.length > 1) Logger.log('  Row 2: ' + JSON.stringify(rows[1]));
      }
    });

    // Test getDashboardData
    const data = getDashboardData();
    Logger.log('Dashboard data summary: ' + JSON.stringify(data.summary));
    Logger.log('Dashboard data brands count: ' + (data.brands ? data.brands.length : 'null'));
    Logger.log('Dashboard data daily count: ' + (data.daily ? data.daily.length : 'null'));
    Logger.log('Dashboard data prompts count: ' + (data.prompts ? data.prompts.length : 'null'));

  } catch (error) {
    Logger.log('✗ Error: ' + error.message);
    Logger.log(error.stack);
  }
}

function testApiConnection() {
  try {
    const prompts = fetchPrompts();
    Logger.log(`✓ API connection successful. Found ${prompts.length} prompts.`);

    const brands = fetchBrands();
    Logger.log(`✓ Found ${brands.length} brands.`);

    // Test report endpoint
    const today = formatDate(new Date());
    const weekAgo = formatDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    const report = fetchBrandsReport(weekAgo, today);
    Logger.log(`✓ Report returned ${report.length} entries.`);

    Logger.log('All API tests passed!');

  } catch (error) {
    Logger.log('✗ API test failed: ' + error.message);
  }
}


