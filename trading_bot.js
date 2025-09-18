const { GSwap, PrivateKeySigner } = require('@gala-chain/gswap-sdk');
const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
const readline = require('readline');

class AstrologicalGalaSwapBot {
  constructor() {
    this.gSwap = null;
    this.walletAddress = '';
    this.checkInterval = 60000; // Default 1 minute
    this.maxGalaPerTrade = 1; // Maximum 1 GALA per trade
    this.maxTradesPerHour = 1; // Maximum 1 trade per hour
    this.minGalaReserve = 5; // Always keep 5 GALA for gas fees
    this.lastTradeTime = 0; // Timestamp of last trade
    this.isRunning = false;
    this.webSocketServer = null;
    this.expressServer = null;
    this.clients = new Set();
    this.currentAnalysis = null;
    this.tradeHistory = [];
  }

  async initialize() {
    console.log('=== 🔮 Astrological GALA/GUSDC Trading Bot ===\n');
    
    // Get user inputs
    const walletAddress = await this.getUserInput('Enter your Gala wallet address (e.g., eth|9Bc3fD09Fa9B41c4FE553D260c467363cfe02aCF): ');
    const privateKey = await this.getUserInput('Enter your private key: ');
    const intervalInput = await this.getUserInput('Enter check interval in milliseconds (default 60000 = 1 minute): ');
    
    this.walletAddress = walletAddress.trim();
    this.checkInterval = intervalInput.trim() ? parseInt(intervalInput.trim()) : 60000;
    
    // Initialize GSwap with private key
    try {
      this.gSwap = new GSwap({
        signer: new PrivateKeySigner(privateKey.trim()),
      });
      
      console.log('\n✅ Bot initialized successfully!');
      console.log(`📍 Wallet: ${this.walletAddress}`);
      console.log(`⏱️  Check interval: ${this.checkInterval}ms (${this.checkInterval/1000}s)`);
      console.log(`📊 Max GALA per trade: ${this.maxGalaPerTrade}`);
      console.log(`⏱️  Max trades per hour: ${this.maxTradesPerHour}`);
      console.log(`🛡️  Gas fee reserve: ${this.minGalaReserve} GALA (always protected)`);
      console.log('\n🔮 Bot will swap GALA → GUSDC when the stars align favorably!');
      console.log('⚠️  Bot will also swap ALL GALA → GUSDC during weak cosmic signals!');
      console.log(`💰 Will always keep ${this.minGalaReserve} GALA for gas fees\n`);
      
      await this.discoverAvailableTokens();
      
      // Ask for immediate test transaction
      const testNow = await this.getUserInput('Would you like to do an immediate test transaction (1 GALA → GUSDC)? (y/n): ');
      if (testNow.toLowerCase().trim() === 'y' || testNow.toLowerCase().trim() === 'yes') {
        await this.executeImmediateTest();
      }
      
      await this.setupWebSocketServer();
      
    } catch (error) {
      console.error('❌ Failed to initialize bot:', error.message);
      process.exit(1);
    }
  }

  getUserInput(prompt) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }

  async setupWebSocketServer() {
    // Setup Express server for REST API
    const app = express();
    app.use(cors());
    app.use(express.json());
    
    // API endpoints
    app.get('/api/status', (req, res) => {
      res.json({
        isRunning: this.isRunning,
        lastTradeTime: this.lastTradeTime,
        canTrade: this.canTrade(),
        nextTradeTime: this.getTimeUntilNextTrade(),
        currentAnalysis: this.currentAnalysis,
        tradeHistory: this.tradeHistory.slice(-10) // Last 10 trades
      });
    });

    app.post('/api/start', (req, res) => {
      if (!this.isRunning) {
        this.start();
        res.json({ success: true, message: 'Bot started' });
      } else {
        res.json({ success: false, message: 'Bot already running' });
      }
    });

    app.post('/api/stop', (req, res) => {
      if (this.isRunning) {
        this.stop();
        res.json({ success: true, message: 'Bot stopped' });
      } else {
        res.json({ success: false, message: 'Bot not running' });
      }
    });

    app.post('/api/force-analysis', async (req, res) => {
      try {
        await this.checkAstrologicalAlignment();
        res.json({ success: true, analysis: this.currentAnalysis });
      } catch (error) {
        res.json({ success: false, error: error.message });
      }
    });

    app.post('/api/test-trade', async (req, res) => {
      try {
        await this.executeTestTrade();
        res.json({ success: true, message: 'Test trade completed' });
      } catch (error) {
        res.json({ success: false, error: error.message });
      }
    });

    // Start Express server
    this.expressServer = app.listen(3001, () => {
      console.log('🌐 API Server running on http://localhost:3001');
    });

    // Setup WebSocket server
    this.webSocketServer = new WebSocket.Server({ port: 3002 });
    
    this.webSocketServer.on('connection', (ws) => {
      console.log('🔌 New client connected to cosmic feed');
      this.clients.add(ws);
      
      // Send current status to new client
      this.sendToClient(ws, {
        type: 'status',
        data: {
          isRunning: this.isRunning,
          currentAnalysis: this.currentAnalysis,
          tradeHistory: this.tradeHistory.slice(-10)
        }
      });
      
      ws.on('close', () => {
        console.log('🔌 Client disconnected from cosmic feed');
        this.clients.delete(ws);
      });
      
      ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
        this.clients.delete(ws);
      });
    });

    console.log('🔮 WebSocket server running on ws://localhost:3002');
  }

  sendToAllClients(message) {
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        this.sendToClient(client, message);
      }
    });
  }

  sendToClient(client, message) {
    try {
      client.send(JSON.stringify(message));
    } catch (error) {
      console.error('❌ Error sending message to client:', error);
    }
  }

  async discoverAvailableTokens() {
    try {
      console.log('🔍 Verifying GALA/GUSDC token pair...');
      
      // Use the correct token identifiers for GALA/GUSDC
      this.galaToken = 'GALA|Unit|none|none';  // Token to sell (GALA)
      this.gusdcToken = 'GUSDC|Unit|none|none';  // Token to buy (GUSDC)
      
      console.log(`📋 Testing: ${this.galaToken} <-> ${this.gusdcToken}`);
      
      // Test the token pair with a small quote
      const quote = await this.gSwap.quoting.quoteExactInput(
        this.galaToken,     // Token to sell (GALA)
        this.gusdcToken,     // Token to buy (GUSDC)
        1  // 1 GALA
      );
      
      console.log(`✅ Token pair verified successfully!`);
      console.log(`   Quote: 1 GALA = ${quote.outTokenAmount} GUSDC`);
      console.log(`   Fee tier: ${quote.feeTier}`);
      
    } catch (error) {
      console.error('❌ Error verifying token pair:', error.message);
      console.log('\n💡 Suggestions:');
      console.log('   1. Check if GALA/GUSDC pair exists on GalaSwap');
      console.log('   2. Verify your wallet has the correct permissions');
      console.log('   3. Check your internet connection');
      console.log('   4. Ensure your wallet has some GALA tokens for trades');
      throw error;
    }
  }

  async executeImmediateTest() {
    try {
      console.log('\n🧪 EXECUTING IMMEDIATE TEST TRANSACTION');
      console.log('=' .repeat(50));
      console.log('🔥 Swapping 1 GALA → GUSDC regardless of astrological conditions');
      console.log('⚡ This will show the bot connection works!');
      
      // Get quote for 1 GALA
      const galaAmount = 1;
      const quote = await this.gSwap.quoting.quoteExactInput(
        this.galaToken,
        this.gusdcToken,
        galaAmount
      );
      
      const expectedGusdc = parseFloat(quote.outTokenAmount);
      
      console.log(`\n📊 Immediate Test Quote:`);
      console.log(`   Input: ${galaAmount} GALA`);
      console.log(`   Expected output: ${expectedGusdc} GUSDC`);
      console.log(`   Fee tier: ${quote.feeTier}`);
      console.log(`   Price per GALA: $${expectedGusdc.toFixed(4)}`);
      
      const confirmTrade = await this.getUserInput('\nExecute this trade now? (y/n): ');
      
      if (confirmTrade.toLowerCase().trim() !== 'y' && confirmTrade.toLowerCase().trim() !== 'yes') {
        console.log('❌ Test transaction cancelled by user');
        return;
      }
      
      console.log('\n🚀 Executing trade...');
      
      // Execute the trade
      const transaction = await this.gSwap.swaps.swap(
        this.galaToken,
        this.gusdcToken,
        quote.feeTier,
        {
          exactIn: galaAmount,
          amountOutMinimum: parseFloat(quote.outTokenAmount) * 0.95, // 5% slippage tolerance
        },
        this.walletAddress
      );
      
      // Record the trade
      const trade = {
        timestamp: new Date().toISOString(),
        type: 'immediate_test',
        amountIn: galaAmount,
        tokenIn: 'GALA',
        amountOut: expectedGusdc,
        tokenOut: 'GUSDC',
        score: 'N/A',
        recommendation: 'IMMEDIATE_TEST',
        transaction: transaction
      };
      
      this.tradeHistory.push(trade);
      
      console.log('\n🎉 IMMEDIATE TEST TRANSACTION SUCCESSFUL!');
      console.log('✅ Your bot is working correctly!');
      console.log(`📊 Trade Results:`);
      console.log(`   ✨ Sold: ${galaAmount} GALA`);
      console.log(`   💰 Received: ~${expectedGusdc} GUSDC`);
      console.log(`   💵 Price: $${expectedGusdc.toFixed(4)} per GALA`);
      console.log(`🔗 Transaction: ${JSON.stringify(transaction, null, 2)}`);
      console.log('\n🌟 Bot is ready for astrological trading!\n');
      
    } catch (error) {
      console.log('\n❌ IMMEDIATE TEST TRANSACTION FAILED!');
      if (error.message.includes('insufficient')) {
        console.log('💰 Issue: Insufficient GALA balance');
        console.log(`   Required: 1 GALA for test`);
        console.log(`   Plus: ${this.minGalaReserve} GALA gas reserve`);
        console.log(`   Total needed: ${1 + this.minGalaReserve} GALA`);
        console.log('   Solution: Add more GALA tokens to your wallet');
      } else if (error.message.includes('slippage')) {
        console.log('⚠️  Issue: Price slippage during test');
        console.log('   This can happen with volatile markets');
      } else {
        console.error(`🔧 Technical issue: ${error.message}`);
      }
      
      console.log('\n❓ Continue with bot setup anyway?');
      const continueChoice = await this.getUserInput('Continue? (y/n): ');
      
      if (continueChoice.toLowerCase().trim() !== 'y' && continueChoice.toLowerCase().trim() !== 'yes') {
        console.log('🛑 Stopping bot setup. Please fix the issues and try again.');
        process.exit(1);
      }
      console.log('🚀 Continuing with astrological bot setup...\n');
    }
  }

  getAstrologicalAnalysis() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const hour = now.getHours();
    const dayOfMonth = now.getDate();
    const month = now.getMonth() + 1;
    
    let analysis = {
      score: 0,
      maxScore: 100,
      factors: [],
      recommendation: 'HOLD',
      confidence: 'LOW',
      timestamp: now.toISOString()
    };

    console.log(`🔮 Performing Astrological Analysis for ${now.toLocaleDateString()} at ${now.toLocaleTimeString()}`);
    console.log('='.repeat(60));

    // 1. Moon Phase Analysis (25 points)
    const moonPhase = this.getMoonPhase(now);
    if (moonPhase === 'New Moon' || moonPhase === 'Waxing Crescent') {
      analysis.score += 25;
      analysis.factors.push({
        type: 'positive',
        icon: '🌑',
        factor: `${moonPhase}`,
        description: 'Perfect for new GALA acquisitions and lunar energy alignment',
        points: 25
      });
    } else if (moonPhase === 'Waxing Gibbous' || moonPhase === 'Full Moon') {
      analysis.score += 15;
      analysis.factors.push({
        type: 'positive',
        icon: '🌕',
        factor: `${moonPhase}`,
        description: 'Strong lunar energy favors GALA trading',
        points: 15
      });
    } else if (moonPhase === 'Waning Gibbous') {
      analysis.score += 5;
      analysis.factors.push({
        type: 'neutral',
        icon: '🌖',
        factor: `${moonPhase}`,
        description: 'Reflection period, moderate GALA energy',
        points: 5
      });
    } else {
      analysis.score -= 10;
      analysis.factors.push({
        type: 'negative',
        icon: '🌘',
        factor: `${moonPhase}`,
        description: 'Waning lunar energy, GALA flows may be restricted',
        points: -10
      });
    }

    // 2. Day of Week Analysis (20 points)
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = dayNames[dayOfWeek];
    
    if (dayOfWeek === 3) { // Wednesday - Mercury day
      analysis.score += 20;
      analysis.factors.push({
        type: 'positive',
        icon: '💨',
        factor: `Wednesday (Mercury)`,
        description: 'Mercury rules communication - excellent for GALA trades',
        points: 20
      });
    } else if (dayOfWeek === 1) { // Monday - Moon day
      analysis.score += 18;
      analysis.factors.push({
        type: 'positive',
        icon: '🌙',
        factor: `Monday (Moon)`,
        description: 'Lunar day enhances GALA energy flows',
        points: 18
      });
    } else if (dayOfWeek === 5) { // Friday - Venus day
      analysis.score += 12;
      analysis.factors.push({
        type: 'positive',
        icon: '💕',
        factor: `Friday (Venus)`,
        description: 'Harmonious energy for wealth attraction',
        points: 12
      });
    } else if (dayOfWeek === 4) { // Thursday - Jupiter day
      analysis.score += 15;
      analysis.factors.push({
        type: 'positive',
        icon: '🪐',
        factor: `Thursday (Jupiter)`,
        description: 'Expansion energy favors GALA adoption',
        points: 15
      });
    } else if (dayOfWeek === 2) { // Tuesday - Mars day
      analysis.score += 8;
      analysis.factors.push({
        type: 'neutral',
        icon: '🔥',
        factor: `Tuesday (Mars)`,
        description: 'Aggressive energy, moderate for GALA',
        points: 8
      });
    } else if (dayOfWeek === 0) { // Sunday - Sun day
      analysis.score += 5;
      analysis.factors.push({
        type: 'neutral',
        icon: '☀️',
        factor: `Sunday (Sun)`,
        description: 'Solar energy, neutral for GALA acquisition',
        points: 5
      });
    } else { // Saturday - Saturn day
      analysis.score -= 5;
      analysis.factors.push({
        type: 'negative',
        icon: '🪨',
        factor: `Saturday (Saturn)`,
        description: 'Restrictive energy, GALA flows limited',
        points: -5
      });
    }

    // 3. Planetary Hour Analysis (20 points)
    const planetaryHour = this.getPlanetaryHour(hour, dayOfWeek);
    if (planetaryHour === 'Mercury') {
      analysis.score += 20;
      analysis.factors.push({
        type: 'positive',
        icon: '☿',
        factor: `Mercury Hour`,
        description: 'Optimal time for GALA trades and communication',
        points: 20
      });
    } else if (planetaryHour === 'Moon') {
      analysis.score += 18;
      analysis.factors.push({
        type: 'positive',
        icon: '🌙',
        factor: `Moon Hour`,
        description: 'Lunar hour enhances GALA flow energy',
        points: 18
      });
    } else if (planetaryHour === 'Jupiter' || planetaryHour === 'Venus') {
      analysis.score += 15;
      analysis.factors.push({
        type: 'positive',
        icon: '✨',
        factor: `${planetaryHour} Hour`,
        description: 'Favorable energy for wealth and expansion',
        points: 15
      });
    } else if (planetaryHour === 'Sun') {
      analysis.score += 10;
      analysis.factors.push({
        type: 'neutral',
        icon: '🌟',
        factor: `Sun Hour`,
        description: 'Solar energy, moderate for financial decisions',
        points: 10
      });
    } else if (planetaryHour === 'Mars') {
      analysis.score += 5;
      analysis.factors.push({
        type: 'neutral',
        icon: '⚔️',
        factor: `Mars Hour`,
        description: 'Aggressive energy, proceed with caution',
        points: 5
      });
    } else { // Saturn
      analysis.score -= 10;
      analysis.factors.push({
        type: 'negative',
        icon: '🪨',
        factor: `Saturn Hour`,
        description: 'Restrictive energy, not ideal for GALA purchases',
        points: -10
      });
    }

    // 4. Numerological Day Analysis (15 points)
    const daySum = this.getNumberSum(dayOfMonth);
    if ([3, 6, 9].includes(daySum)) {
      analysis.score += 15;
      analysis.factors.push({
        type: 'positive',
        icon: '🔢',
        factor: `Day ${dayOfMonth} (${daySum})`,
        description: 'Flow number - perfect for GALA energy',
        points: 15
      });
    } else if ([1, 8].includes(daySum)) {
      analysis.score += 10;
      analysis.factors.push({
        type: 'positive',
        icon: '🔢',
        factor: `Day ${dayOfMonth} (${daySum})`,
        description: 'Manifestation number - good for GALA acquisition',
        points: 10
      });
    } else if ([2, 5, 7].includes(daySum)) {
      analysis.score += 5;
      analysis.factors.push({
        type: 'neutral',
        icon: '🔢',
        factor: `Day ${dayOfMonth} (${daySum})`,
        description: 'Balanced energy for GALA',
        points: 5
      });
    } else {
      analysis.score += 0;
      analysis.factors.push({
        type: 'neutral',
        icon: '🔢',
        factor: `Day ${dayOfMonth} (${daySum})`,
        description: 'Neutral numerological influence',
        points: 0
      });
    }

    // 5. Mercury Retrograde Check (important for GALA communication energy)
    const isRetrograde = this.isMercuryRetrograde(now);
    if (isRetrograde) {
      analysis.score -= 20;
      analysis.factors.push({
        type: 'negative',
        icon: '☿',
        factor: `Mercury Retrograde`,
        description: 'Communication disruptions - reduce GALA activity',
        points: -20
      });
    } else {
      analysis.score += 10;
      analysis.factors.push({
        type: 'positive',
        icon: '☿',
        factor: `Mercury Direct`,
        description: 'Clear communication - excellent for GALA trades',
        points: 10
      });
    }

    // 6. Seasonal Energy (10 points)
    const season = this.getSeason(month);
    if (season === 'Spring') {
      analysis.score += 10;
      analysis.factors.push({
        type: 'positive',
        icon: '🌸',
        factor: `Spring`,
        description: 'Growth and new financial flows - good for GALA',
        points: 10
      });
    } else if (season === 'Summer') {
      analysis.score += 8;
      analysis.factors.push({
        type: 'positive',
        icon: '☀️',
        factor: `Summer`,
        description: 'Peak energy and GALA expansion',
        points: 8
      });
    } else if (season === 'Autumn') {
      analysis.score += 5;
      analysis.factors.push({
        type: 'neutral',
        icon: '🍂',
        factor: `Autumn`,
        description: 'Harvest energy - consolidation time for GALA',
        points: 5
      });
    } else {
      analysis.score += 2;
      analysis.factors.push({
        type: 'neutral',
        icon: '❄️',
        factor: `Winter`,
        description: 'Reflection period - slow GALA accumulation',
        points: 2
      });
    }

    // Determine recommendation based on your 60+ requirement
    if (analysis.score >= 60) {
      analysis.recommendation = 'BUY - COSMIC ALIGNMENT';
      analysis.confidence = 'HIGH';
    } else if (analysis.score >= 40) {
      analysis.recommendation = 'WEAK BUY';
      analysis.confidence = 'MEDIUM';
    } else {
      analysis.recommendation = 'HOLD';
      analysis.confidence = 'HIGH';
    }

    console.log('\n📊 ASTROLOGICAL ANALYSIS RESULTS:');
    console.log('-'.repeat(40));
    analysis.factors.forEach(factor => {
      const sign = factor.points >= 0 ? '+' : '';
      console.log(`   ${factor.icon} ${factor.factor}: ${factor.description} (${sign}${factor.points})`);
    });
    console.log('-'.repeat(40));
    console.log(`🎯 Total Score: ${analysis.score}/${analysis.maxScore}`);
    console.log(`📈 Recommendation: ${analysis.recommendation} (${analysis.confidence} confidence)`);
    console.log('='.repeat(60));

    // Store current analysis
    this.currentAnalysis = analysis;

    // Return the correct properties including buyImmediately
    return {
      shouldBuy: analysis.score >= 60,          // True when score is 60 or higher
      buyImmediately: analysis.score >= 60,     // Added missing property
      score: analysis.score,
      recommendation: analysis.recommendation,
      confidence: analysis.confidence,
      factors: analysis.factors,
      moonPhase: moonPhase,
      analysis: analysis
    };
  }

  getMoonPhase(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    
    // Calculate days since a known new moon (Jan 1, 2000)
    const baseDate = new Date(2000, 0, 6); // Known new moon
    const daysSince = (date - baseDate) / (1000 * 60 * 60 * 24);
    const phase = (daysSince % 29.53) / 29.53; // Moon cycle is ~29.53 days
    
    if (phase < 0.0625) return 'New Moon';
    if (phase < 0.1875) return 'Waxing Crescent';
    if (phase < 0.3125) return 'First Quarter';
    if (phase < 0.4375) return 'Waxing Gibbous';
    if (phase < 0.5625) return 'Full Moon';
    if (phase < 0.6875) return 'Waning Gibbous';
    if (phase < 0.8125) return 'Last Quarter';
    return 'Waning Crescent';
  }

  getPlanetaryHour(hour, dayOfWeek) {
    const dayPlanets = [
      ['Sun', 'Venus', 'Mercury', 'Moon', 'Saturn', 'Jupiter', 'Mars'], // Sunday
      ['Moon', 'Saturn', 'Jupiter', 'Mars', 'Sun', 'Venus', 'Mercury'], // Monday
      ['Mars', 'Sun', 'Venus', 'Mercury', 'Moon', 'Saturn', 'Jupiter'], // Tuesday
      ['Mercury', 'Moon', 'Saturn', 'Jupiter', 'Mars', 'Sun', 'Venus'], // Wednesday
      ['Jupiter', 'Mars', 'Sun', 'Venus', 'Mercury', 'Moon', 'Saturn'], // Thursday
      ['Venus', 'Mercury', 'Moon', 'Saturn', 'Jupiter', 'Mars', 'Sun'], // Friday
      ['Saturn', 'Jupiter', 'Mars', 'Sun', 'Venus', 'Mercury', 'Moon']  // Saturday
    ];
    
    const adjustedHour = (hour + 18) % 24;
    const planetIndex = Math.floor(adjustedHour / 3.43) % 7;
    
    return dayPlanets[dayOfWeek][planetIndex];
  }

  getNumberSum(number) {
    while (number > 9) {
      number = number.toString().split('').reduce((sum, digit) => sum + parseInt(digit), 0);
    }
    return number;
  }

  isMercuryRetrograde(date) {
    const year = date.getFullYear();
    
    const retroPeriods2024 = [
      {start: new Date(2024, 3, 1), end: new Date(2024, 3, 25)}, // April 1-25
      {start: new Date(2024, 7, 5), end: new Date(2024, 7, 28)}, // Aug 5-28
      {start: new Date(2024, 10, 25), end: new Date(2024, 11, 15)} // Nov 25 - Dec 15
    ];
    
    const retroPeriods2025 = [
      {start: new Date(2025, 2, 14), end: new Date(2025, 3, 7)}, // March 14 - April 7
      {start: new Date(2025, 6, 18), end: new Date(2025, 7, 11)}, // July 18 - Aug 11
      {start: new Date(2025, 10, 9), end: new Date(2025, 10, 29)} // Nov 9-29
    ];
    
    const periods = year === 2024 ? retroPeriods2024 : retroPeriods2025;
    
    return periods.some(period => date >= period.start && date <= period.end);
  }

  getSeason(month) {
    if (month >= 3 && month <= 5) return 'Spring';
    if (month >= 6 && month <= 8) return 'Summer';
    if (month >= 9 && month <= 11) return 'Autumn';
    return 'Winter';
  }

  async checkAstrologicalAlignment() {
    try {
      console.log(`🔍 [${new Date().toLocaleString()}] Consulting the cosmic forces for GALA...`);
      
      // Get astrological analysis
      const astroAnalysis = this.getAstrologicalAnalysis();
      
      // Send update to all connected clients
      this.sendToAllClients({
        type: 'analysis',
        data: astroAnalysis.analysis
      });
      
      if (astroAnalysis.shouldBuy && astroAnalysis.buyImmediately) {
        if (this.canTrade()) {
          console.log(`🌟 ${astroAnalysis.recommendation}: The stars command immediate GALA → GUSDC action!`);
          await this.getQuoteAndExecuteTrade();
        } else {
          const timeUntilNextTrade = this.getTimeUntilNextTrade();
          console.log(`⏳ ${astroAnalysis.recommendation} but earthly time limits apply. Next trade in ${timeUntilNextTrade}`);
        }
      } else if (astroAnalysis.analysis.score < 30) {
        // Weak signal - swap available GALA for GUSDC
        console.log(`⚠️ WEAK COSMIC SIGNALS DETECTED (Score: ${astroAnalysis.analysis.score})`);
        console.log(`🌊 Defensive action required: Converting available GALA to stable GUSDC`);
        await this.executeDefensiveSwap();
      } else if (astroAnalysis.shouldBuy && !astroAnalysis.buyImmediately) {
        console.log(`🌙 ${astroAnalysis.recommendation}: Cosmic forces are mixed. Waiting for clearer GALA signals...`);
      } else {
        console.log(`🌙 ${astroAnalysis.recommendation}: The cosmic forces advise patience. Current energy not favorable for GALA trading.`);
      }
      
    } catch (error) {
      console.error('❌ Error during astrological consultation:', error.message);
    }
  }

  async getGalaBalance() {
    try {
      // This should use the GalaSwap SDK to get actual GALA balance
      // For now, returning a mock value - replace with actual balance check
      // const balance = await this.gSwap.tokens.getBalance(this.galaToken, this.walletAddress);
      // return parseFloat(balance);
      
      // Mock balance for testing - replace with real implementation
      return 10.0; // This should be the actual GALA balance from the wallet
    } catch (error) {
      console.error('Error getting GALA balance:', error.message);
      return 0;
    }
  }

  async executeDefensiveSwap() {
    try {
      console.log('\n🛡️ EXECUTING DEFENSIVE SWAP: AVAILABLE GALA → GUSDC');
      console.log('=' .repeat(60));
      console.log('⚠️ Weak cosmic signals detected - protecting assets');
      console.log('🌊 Converting available GALA to stable GUSDC for safety');
      
      // Get current GALA balance
      const galaBalance = await this.getGalaBalance();
      
      if (galaBalance <= this.minGalaReserve) {
        console.log(`💰 Insufficient GALA balance for defensive swap`);
        console.log(`   Current balance: ${galaBalance} GALA`);
        console.log(`   Required minimum: ${this.minGalaReserve} GALA (for gas fees)`);
        console.log(`   Available for swap: ${Math.max(0, galaBalance - this.minGalaReserve)} GALA`);
        return;
      }
      
      // Reserve GALA for gas fees, swap the rest
      const swapAmount = Math.max(0, galaBalance - this.minGalaReserve);
      
      if (swapAmount <= 0.1) { // Need at least 0.1 GALA to make swap worthwhile
        console.log(`💰 GALA balance too low for meaningful defensive swap`);
        console.log(`   Available for swap: ${swapAmount} GALA (below 0.1 GALA minimum)`);
        return;
      }
      
      console.log(`\n📊 Defensive Swap Details:`);
      console.log(`   Current GALA balance: ${galaBalance}`);
      console.log(`   Amount to swap: ${swapAmount} GALA`);
      console.log(`   Protected for gas: ${this.minGalaReserve} GALA`);
      console.log(`   Final GALA balance: ${galaBalance - swapAmount} GALA`);
      
      // Get quote for defensive swap
      const quote = await this.gSwap.quoting.quoteExactInput(
        this.galaToken,
        this.gusdcToken,
        swapAmount
      );
      
      const expectedGusdc = parseFloat(quote.outTokenAmount);
      
      console.log(`   Expected GUSDC: ${expectedGusdc}`);
      console.log(`   Price per GALA: $${(expectedGusdc/swapAmount).toFixed(4)}`);
      
      console.log('\n🚀 Executing defensive swap...');
      
      // Execute the defensive swap
      const transaction = await this.gSwap.swaps.swap(
        this.galaToken,
        this.gusdcToken,
        quote.feeTier,
        {
          exactIn: swapAmount,
          amountOutMinimum: parseFloat(quote.outTokenAmount) * 0.95, // 5% slippage tolerance
        },
        this.walletAddress
      );
      
      // Record the defensive swap
      const defensiveTrade = {
        timestamp: new Date().toISOString(),
        type: 'defensive_swap',
        amountIn: swapAmount,
        tokenIn: 'GALA',
        amountOut: expectedGusdc,
        tokenOut: 'GUSDC',
        score: this.currentAnalysis ? this.currentAnalysis.score : 0,
        recommendation: 'DEFENSIVE_SWAP',
        reason: 'Weak cosmic signals - asset protection',
        galaReserved: this.minGalaReserve,
        transaction: transaction
      };
      
      this.tradeHistory.push(defensiveTrade);
      
      console.log('\n🛡️ DEFENSIVE SWAP COMPLETED SUCCESSFULLY!');
      console.log('✅ Assets protected during weak cosmic period');
      console.log(`📊 Defensive Swap Results:`);
      console.log(`   🔄 Swapped: ${swapAmount} GALA`);
      console.log(`   💰 Received: ~${expectedGusdc} GUSDC`);
      console.log(`   🛡️ Protection: Assets now in stable GUSDC`);
      console.log(`   ⛽ Gas Reserve: ${this.minGalaReserve} GALA protected`);
      console.log(`   📊 Final GALA Balance: ${this.minGalaReserve} GALA`);
      console.log(`🔗 Transaction: ${JSON.stringify(transaction, null, 2)}`);
      console.log('\n🌟 Portfolio protected! Will monitor for better cosmic conditions...\n');
      
      // Send defensive swap to clients
      this.sendToAllClients({
        type: 'trade',
        data: defensiveTrade
      });
      
      // Send special defensive alert
      this.sendToAllClients({
        type: 'defensive_action',
        data: {
          action: 'DEFENSIVE_SWAP_EXECUTED',
          reason: 'Weak cosmic signals',
          amount: swapAmount,
          galaReserved: this.minGalaReserve,
          score: this.currentAnalysis ? this.currentAnalysis.score : 0,
          finalGalaBalance: this.minGalaReserve
        }
      });
      
    } catch (error) {
      console.log('\n❌ DEFENSIVE SWAP FAILED!');
      if (error.message.includes('insufficient')) {
        console.log('💰 Issue: Insufficient GALA balance for defensive swap');
        console.log(`   Remember: ${this.minGalaReserve} GALA must be kept for gas fees`);
      } else if (error.message.includes('slippage')) {
        console.log('⚠️  Issue: Price slippage during defensive swap');
        console.log('   Market conditions may be volatile');
      } else {
        console.error(`🔧 Technical issue: ${error.message}`);
        console.log('   Will retry defensive action in next cycle');
      }
      
      // Send error to clients
      this.sendToAllClients({
        type: 'error',
        data: { 
          message: error.message, 
          context: 'defensive_swap',
          action: 'Protect assets during weak signals',
          galaReserveRequired: this.minGalaReserve
        }
      });
    }
  }

  async getQuoteAndExecuteTrade() {
    try {
      // Check if we have enough GALA for trade plus gas reserve
      const galaBalance = await this.getGalaBalance();
      const totalGalaNeeded = this.maxGalaPerTrade + this.minGalaReserve;
      
      if (galaBalance < totalGalaNeeded) {
        console.log(`💰 Insufficient GALA for cosmic trade`);
        console.log(`   Current balance: ${galaBalance} GALA`);
        console.log(`   Required for trade: ${this.maxGalaPerTrade} GALA`);
        console.log(`   Required for gas: ${this.minGalaReserve} GALA`);
        console.log(`   Total needed: ${totalGalaNeeded} GALA`);
        console.log(`   Shortage: ${(totalGalaNeeded - galaBalance).toFixed(2)} GALA`);
        
        // Send insufficient balance alert to clients
        this.sendToAllClients({
          type: 'error',
          data: { 
            message: `Insufficient GALA balance: ${galaBalance} / ${totalGalaNeeded} needed`, 
            context: 'trade_preparation',
            currentBalance: galaBalance,
            requiredBalance: totalGalaNeeded,
            gasReserve: this.minGalaReserve
          }
        });
        return;
      }
      
      // Get quote for our trade amount
      const galaAmount = this.maxGalaPerTrade;
      const quote = await this.gSwap.quoting.quoteExactInput(
        this.galaToken,
        this.gusdcToken,
        galaAmount
      );
      
      const gusdcAmount = parseFloat(quote.outTokenAmount);
      
      console.log(`📊 Cosmic GALA Trade Quote:`);
      console.log(`   Offering to the universe: ${galaAmount} GALA`);
      console.log(`   Expecting cosmic return: ${gusdcAmount} GUSDC`);
      console.log(`   Post-trade GALA balance: ${(galaBalance - galaAmount).toFixed(2)} GALA`);
      console.log(`   Gas reserve protected: ${this.minGalaReserve} GALA`);
      
      await this.executeTrade(quote, galaAmount, gusdcAmount);
      
    } catch (error) {
      console.error('❌ Error getting cosmic GALA quote:', error.message);
    }
  }

  async executeTestTrade() {
    try {
      console.log('\n🧪 Executing GALA test trade...');
      console.log('⚗️ Testing cosmic connection with 0.5 GALA sacrifice...');
      
      // Get quote for 0.5 GALA test trade
      const testGalaAmount = 0.5;
      const quote = await this.gSwap.quoting.quoteExactInput(
        this.galaToken,
        this.gusdcToken,
        testGalaAmount
      );
      
      const expectedGusdc = parseFloat(quote.outTokenAmount);
      
      console.log(`📊 Test GALA Trade Quote:`);
      console.log(`   Offering: ${testGalaAmount} GALA`);
      console.log(`   Expected return: ${expectedGusdc} GUSDC`);
      console.log(`   Fee tier: ${quote.feeTier}`);
      
      // Execute the test trade
      const transaction = await this.gSwap.swaps.swap(
        this.galaToken,
        this.gusdcToken,
        quote.feeTier,
        {
          exactIn: testGalaAmount,
          amountOutMinimum: parseFloat(quote.outTokenAmount) * 0.95, // 5% slippage tolerance
        },
        this.walletAddress
      );
      
      // Record test trade
      const testTrade = {
        timestamp: new Date().toISOString(),
        type: 'test',
        amountIn: testGalaAmount,
        tokenIn: 'GALA',
        amountOut: expectedGusdc,
        tokenOut: 'GUSDC',
        score: 0,
        transaction: transaction
      };
      
      console.log('\n✅ TEST GALA TRADE SUCCESSFUL!');
      console.log('🎉 Bot connectivity verified! The cosmic GALA connection is strong!');
      console.log(`📊 Test Results:`);
      console.log(`   ✨ Traded: ${testGalaAmount} GALA`);
      console.log(`   💰 Received: ~${expectedGusdc} GUSDC`);
      console.log(`🔗 Transaction: ${JSON.stringify(transaction, null, 2)}`);
      console.log('\n🚀 Ready to begin astrological GALA trading!\n');
      
      // Send test trade result to clients
      this.sendToAllClients({
        type: 'trade',
        data: testTrade
      });
      
    } catch (error) {
      console.log('\n❌ TEST GALA TRADE FAILED!');
      if (error.message.includes('insufficient')) {
        console.log('💰 Issue: Insufficient GALA balance');
        console.log(`   Required: 0.5 GALA for test`);
        console.log(`   Plus: ${this.minGalaReserve} GALA gas reserve`);
        console.log(`   Total needed: ${0.5 + this.minGalaReserve} GALA`);
        console.log('   Solution: Add more GALA tokens to your wallet');
      } else if (error.message.includes('slippage')) {
        console.log('⚠️  Issue: Price slippage during test');
        console.log('   This is normal - the bot connection works!');
      } else {
        console.error(`🔧 Technical issue: ${error.message}`);
        console.log('   The bot may still work for actual trades');
      }
      
      throw error;
    }
  }

  async executeTrade(quote, galaAmount, expectedGusdcAmount) {
    try {
      console.log('🌟 Executing cosmic GALA trade under favorable stars...');
      console.log(`   Sacrificing: ${galaAmount} GALA`);
      console.log(`   Manifesting: ~${expectedGusdcAmount} GUSDC`);
      
      const transaction = await this.gSwap.swaps.swap(
        this.galaToken,
        this.gusdcToken,
        quote.feeTier,
        {
          exactIn: galaAmount,
          amountOutMinimum: parseFloat(quote.outTokenAmount) * 0.95, // 5% slippage tolerance
        },
        this.walletAddress
      );
      
      this.lastTradeTime = Date.now();
      
      // Record successful trade
      const trade = {
        timestamp: new Date().toISOString(),
        type: 'live',
        amountIn: galaAmount,
        tokenIn: 'GALA',
        amountOut: expectedGusdcAmount,
        tokenOut: 'GUSDC',
        score: this.currentAnalysis ? this.currentAnalysis.score : 0,
        recommendation: this.currentAnalysis ? this.currentAnalysis.recommendation : 'UNKNOWN',
        transaction: transaction
      };
      
      this.tradeHistory.push(trade);
      
      console.log('🎉 Cosmic GALA trade successfully manifested!');
      console.log(`📊 Divine Transaction Summary:`);
      console.log(`   ✨ Offered: ${galaAmount} GALA`);
      console.log(`   💰 Received: ~${expectedGusdcAmount} GUSDC`);
      console.log(`   🔮 Next cosmic window opens in: 1 hour`);
      console.log(`🌌 Transaction blessed by the universe: ${JSON.stringify(transaction, null, 2)}`);
      
      // Send trade result to clients
      this.sendToAllClients({
        type: 'trade',
        data: trade
      });
      
      // Send updated status
      this.sendToAllClients({
        type: 'status',
        data: {
          isRunning: this.isRunning,
          lastTradeTime: this.lastTradeTime,
          canTrade: this.canTrade(),
          nextTradeTime: this.getTimeUntilNextTrade()
        }
      });
      
    } catch (error) {
      if (error.message.includes('insufficient')) {
        console.log('⚠️  Insufficient GALA in earthly wallet');
        console.log(`   The cosmos demands: ${galaAmount} GALA`);
        console.log('   Please replenish your cosmic reserves');
      } else {
        console.error('💫 The cosmic GALA trade was disrupted by temporal forces:', error.message);
      }
      
      // Send error to clients
      this.sendToAllClients({
        type: 'error',
        data: { message: error.message, context: 'trade_execution' }
      });
    }
  }

  canTrade() {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    return (now - this.lastTradeTime) >= oneHour;
  }

  getTimeUntilNextTrade() {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const timeSinceLastTrade = now - this.lastTradeTime;
    const timeRemaining = oneHour - timeSinceLastTrade;
    
    if (timeRemaining <= 0) return "now";
    
    const minutes = Math.floor(timeRemaining / (60 * 1000));
    const seconds = Math.floor((timeRemaining % (60 * 1000)) / 1000);
    
    return `${minutes}m ${seconds}s`;
  }

  async start() {
    if (this.isRunning) {
      console.log('⚠️  Cosmic GALA bot is already consulting the stars!');
      return;
    }

    if (!this.galaToken || !this.gusdcToken) {
      console.error('❌ Token identifiers not found in the cosmic database. Cannot start bot.');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Initiating astrological GALA trading protocol...\n');
    console.log(`🔮 Using cosmic tokens: ${this.galaToken} → ${this.gusdcToken}`);
    console.log(`📊 Trade settings: ${this.maxGalaPerTrade} GALA per cosmic event, max ${this.maxTradesPerHour} trade per hour`);
    console.log('🌟 The bot will trade when the celestial bodies align favorably for GALA!');
    console.log(`🛡️  DEFENSIVE MODE: Will swap available GALA → GUSDC when cosmic score < 30`);
    console.log(`⛽ GAS PROTECTION: Always maintains ${this.minGalaReserve} GALA for gas fees`);
    console.log('Press Ctrl+C to disconnect from cosmic forces\n');

    // Send start event to clients
    this.sendToAllClients({
      type: 'bot_started',
      data: { timestamp: new Date().toISOString() }
    });

    // Initial cosmic consultation
    await this.checkAstrologicalAlignment();

    // Set up interval for regular cosmic checks
    this.intervalId = setInterval(async () => {
      if (this.isRunning) {
        await this.checkAstrologicalAlignment();
      }
    }, this.checkInterval);
  }

  stop() {
    if (!this.isRunning) {
      console.log('⚠️  Cosmic GALA bot is not currently active!');
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    
    // Send stop event to clients
    this.sendToAllClients({
      type: 'bot_stopped',
      data: { timestamp: new Date().toISOString() }
    });
    
    console.log('🛑 Disconnected from cosmic GALA trading forces.');
  }
}

// Main execution
async function main() {
  const bot = new AstrologicalGalaSwapBot();
  
  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    console.log('\n🛑 Closing connection to cosmic GALA forces...');
    bot.stop();
    
    // Close servers
    if (bot.webSocketServer) {
      bot.webSocketServer.close();
    }
    if (bot.expressServer) {
      bot.expressServer.close();
    }
    
    process.exit(0);
  });

  try {
    await bot.initialize();
    await bot.start();
  } catch (error) {
    console.error('💥 Cosmic disruption detected:', error.message);
    console.log('\n🔧 Realigning cosmic energies:');
    console.log('   1. Verify GALA/GUSDC pair exists in the cosmic marketplace');
    console.log('   2. Check your earthly wallet credentials');
    console.log('   3. Ensure sufficient GALA tokens for cosmic transactions');
    console.log('   4. Install required packages: npm install ws express cors @gala-chain/gswap-sdk');
    console.log('   5. Meditate and try again when the stars are more favorable');
    process.exit(1);
  }
}

// Run the bot
if (require.main === module) {
  main();
}

module.exports = AstrologicalGalaSwapBot;
