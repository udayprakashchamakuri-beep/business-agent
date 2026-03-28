# 🚀 AI Crypto Trading Platform

A full-stack, AI-powered crypto trading dashboard that simulates real-world trading using a **multi-agent system**, real-time market data, and autonomous decision-making.

---

## 📌 Overview

This project is designed to mimic how real trading firms operate by using **multiple intelligent agents**, each specializing in a different aspect of market analysis.

Instead of relying on a single model, the system combines:
- Technical analysis  
- Machine learning predictions  
- News sentiment  
- Risk evaluation  

👉 All combined into one final trading decision.

---

## 🧠 Key Features

### ⚡ Real-Time Market Data
- Live crypto price updates via WebSocket  
- Multi-coin support:
  - BTC, ETH, BNB, XRP, SOL, DOGE  

---

### 🤖 Multi-Agent System

Each agent performs a specific task:

- **Technical Agent**
  - Uses RSI & SMA indicators  
- **ML Agent**
  - Predicts trends with confidence score  
- **News Agent**
  - Analyzes sentiment & relevance  
- **Risk Agent**
  - Evaluates volatility & risk level  
- **Decision Agent**
  - Combines all outputs → BUY / SELL / HOLD  

---

### 🔁 Autonomous Trading Loop
- Configurable:
  - Duration  
  - Interval  
  - Trading coin  
- Simulated execution (paper trading)  
- Generates:
  - Profit & Loss (PnL)  
  - Return %  
  - Trade statistics  

---

### 📊 Market Views
- Top Gainers  
- Top Losers  
- Trending Coins  
- Live Candlestick Charts  
- Indicator overlays  

---

### 📰 News Intelligence Pipeline
- News ingestion support  
- Duplicate filtering  
- Coin relevance scoring  
- Fallback mock feed  

---

### 🔍 Replay / Backtesting Mode
- Compare:
  - Agent decision vs actual result  
- Metrics:
  - Win rate  
  - Drawdown  
  - Equity curve  

---

### 💼 Portfolio & Journal
- Holdings & allocation tracking  
- Trade history  
- Redis-backed state (with fallback)  

---

### 🖥️ Modern UI
- Desktop-first design  
- Sidebar navigation  
- Live notifications  
- Interactive charts  

---

## 🏗️ Tech Stack

### Backend
- FastAPI  
- CCXT (crypto exchange integration)  
- Redis  
- Pandas  
- HTTPX  

---

### Frontend
- React (Vite)  
- React Router  
- Tailwind CSS  
- WebSocket  

---

### AI / LLM Integration
- Featherless (primary)  
- Groq (fallback)  

---

### Data Sources
- Real-time crypto data via exchange APIs  
- News ingestion pipeline  

---

## ⚙️ System Architecture
