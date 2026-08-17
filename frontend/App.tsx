import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronRight, ChevronLeft, ChevronDown, ChevronUp,
  MapPin, Store, Clock, CheckCircle, XCircle, AlertTriangle,
  Package, TrendingUp, Users, DollarSign, BarChart2, Info, User,
  ShoppingCart, Building2, Banknote, Megaphone, Tag, BookOpen,
  PanelLeftClose, PanelLeftOpen, Trophy, Send, X, Sparkles, Map
} from 'lucide-react';
import { GoogleGenAI } from '@google/genai';

// ============================================================================
// TYPES
// ============================================================================

type ScreenId =
  | "LANDING" | "I1" | "I2" | "D3" | "D1" | "D2" | "D4" | "P1" | "D5" | "D6"
  | "G1" | "G2" | "G4"
  | "BSC" | "BSC_FINAL" | "D7" | "FINAL";

type Demand = "High" | "Medium" | "Low" | "None";
interface ReqItem { id: string; name: string; flavorText: string; cat: string; cost: number; storeIdx: number; }

interface CPResult {
  cp: number; fulfilled: number; missed: number;
  revenue: number; rent: number; invCost: number; mudCut: number; promoCost: number; profit: number;
  satisfaction: number; recognition: number;
  pillarScores: { financial: number; customer: number; internal: number };
  saudaEffect:  { financial: number; customer: number; internal: number };
}

interface StoreData {
  id: string;
  name: string;
  location: string;
  scale: string;
  selectedItems: string[];
  prices: Record<string, "value" | "standard" | "premium">;
  stock: Record<string, number>;
}

interface GameState {
  screen: ScreenId;
  playerName: string;
  capital: number;
  mudarabah: number;
  stores: StoreData[];
  currentStoreIdx: number; // Used when setting up a new store
  checkpoint: number; 
  reqIdx: number; 
  requests: ReqItem[];
  results: ("fulfilled" | "missed")[];
  cpHistory: CPResult[]; 
  growChoice: string;
  openAcc: string[]; 
  readTools: string[];
  reopening: boolean;
  setupPoints: { financial: number; customer: number; internal: number };
  promotionChoice: string;
}

type ScreenProps = {
  gs: GameState;
  go: (s: ScreenId, e?: Partial<GameState>) => void;
  setGs: React.Dispatch<React.SetStateAction<GameState>>;
};

// ============================================================================
// CONSTANTS
// ============================================================================

const BASE_CAPITAL = 500000;
const UNITS_PER_ITEM = 20;

const MUD_TIERS = [
  { id:0, name:"No Partner",   topUp:0,       share:"0%",  renov:"×1.0", desc:"Keep all profits — go it alone." },
  { id:1, name:"Small Stake",  topUp:200000,  share:"15%", renov:"×1.2", desc:"Light partnership, modest capital top-up." },
  { id:2, name:"Medium Stake", topUp:500000,  share:"25%", renov:"×1.5", desc:"Balanced deal — solid capital boost." },
  { id:3, name:"Large Stake",  topUp:1000000, share:"40%", renov:"×2.0", desc:"Major backer — maximum renovation credit." },
];
const MUD_SHARES = [0, 0.15, 0.25, 0.40];

const LOCS = [
  { id:"korangi", name:"Korangi",         tag:"Industrial / Working Class",  cost:30000,  footfall:3, basket:500, comp:2,
    demand:{ staples:"High",   dairy:"High",   bakery:"Medium", produce:"Low",    care:"Medium", utility:"Low"    } },
  { id:"gulshan", name:"Gulshan-e-Iqbal", tag:"Middle Class Residential",    cost:60000,  footfall:4, basket:1000, comp:3,
    demand:{ staples:"High",   dairy:"Medium", bakery:"High",   produce:"Medium", care:"High",   utility:"Medium" } },
  { id:"saddar",  name:"Saddar",          tag:"Commercial Hub",              cost:100000, footfall:5, basket:800, comp:5,
    demand:{ staples:"Medium", dairy:"Low",    bakery:"Medium", produce:"Medium", care:"Medium", utility:"High"   } },
  { id:"clifton", name:"Clifton / DHA",   tag:"Upscale Residential",         cost:150000, footfall:3, basket:2000, comp:4,
    demand:{ staples:"Low",    dairy:"High",   bakery:"Medium", produce:"High",   care:"High",   utility:"Low"    } },
] as const;

const SCALES = [
  { id:"counter", name:"Kiryana Counter",    fp:"100–300 sq ft",   inv:"Rs 40k–80k",   units:12, minCap:0,      desc:"Small counter covering essentials only. Lowest risk." },
  { id:"mini",    name:"Mini Mart",          fp:"300–800 sq ft",   inv:"Rs 80k–120k",  units:18, minCap:300000, desc:"Mid-sized shop with variety across categories." },
  { id:"dept",    name:"Departmental Store", fp:"800–2,000 sq ft", inv:"Rs 120k–180k", units:24, minCap:800000, desc:"Full-service store — maximum variety and reach." },
];

const CATS = [
  { id:"staples", name:"Staples & Grocery",         icon:"🌾" },
  { id:"dairy",   name:"Dairy & Beverages",         icon:"🥛" },
  { id:"bakery",  name:"Bakery & Snacks",           icon:"🍞" },
  { id:"produce", name:"Fresh Produce",             icon:"🥦" },
  { id:"care",    name:"Personal Care & Household", icon:"🧴" },
  { id:"utility", name:"Utility & Mobile Services", icon:"📱" },
];

const PRICE_TIERS = [
  { id:"value",    label:"Value",    mult:1.10 },
  { id:"standard", label:"Standard", mult:1.25 },
  { id:"premium",  label:"Premium",  mult:1.45 },
];

const ALL_ITEMS = [
  { id:"atta",       name:"Atta (Flour) 1 kg",        cost: 150, flavorText:"Roti banana hai ghar mein, jaldi chahiye!",      cat:"staples", demand:{korangi:"High",   gulshan:"High",   saddar:"Medium", clifton:"None"  } },
  { id:"chawal",     name:"Basmati Chawal 2 kg",      cost: 600, flavorText:"Biryani ki dawat hai aaj, accha wala dena.",    cat:"staples", demand:{korangi:"High",   gulshan:"High",   saddar:"Medium", clifton:"Low"   } },
  { id:"daal",       name:"Daal Masoor 500 g",        cost: 200, flavorText:"Ammi ne bheja hai, koi acchi masoor daal.",     cat:"staples", demand:{korangi:"High",   gulshan:"Medium", saddar:"Low",    clifton:"None"  } },
  { id:"chini",      name:"Chini (Sugar) 1 kg",       cost: 140, flavorText:"Chai ke liye chini khatam ho gayi!",            cat:"staples", demand:{korangi:"High",   gulshan:"High",   saddar:"Medium", clifton:"Low"   } },
  { id:"oil",        name:"Cooking Oil 1 L",          cost: 500, flavorText:"Khana banana hai, oil chahiye abhi.",           cat:"staples", demand:{korangi:"High",   gulshan:"High",   saddar:"Low",    clifton:"None"  } },
  { id:"tealeaves",  name:"Chai Patti 200 g",         cost: 300, flavorText:"Mehman aa rahe hain, chai banana hai!",         cat:"staples", demand:{korangi:"High",   gulshan:"Medium", saddar:"Low",    clifton:"Medium"} },
  { id:"masala",     name:"Garam Masala Mix",         cost: 100, flavorText:"Gosht ka salan bana raha hoon, masala chahiye.",cat:"staples", demand:{korangi:"None",   gulshan:"Medium", saddar:"High",   clifton:"None"  } },
  { id:"milk",       name:"Dudh (Milk) 500 ml",       cost: 120, flavorText:"Bacha subah school jaata hai, dudh chahiye.",   cat:"dairy",   demand:{korangi:"Medium", gulshan:"High",   saddar:"Low",    clifton:"Medium"} },
  { id:"dahi",       name:"Dahi (Yogurt) 400 g",      cost: 100, flavorText:"Biryani ke saath dahi dena bhai!",              cat:"dairy",   demand:{korangi:"Low",    gulshan:"Medium", saddar:"Low",    clifton:"Medium"} },
  { id:"eggs",       name:"Anda (Eggs) ×6",           cost: 180, flavorText:"Omelette banana hai, 6 ande chahiye.",          cat:"dairy",   demand:{korangi:"Low",    gulshan:"Low",    saddar:"Medium", clifton:"High"  } },
  { id:"softdrinks", name:"Cold Drink (Bottle)",      cost: 150, flavorText:"Garmi mein thanda kuch do bhai!",               cat:"dairy",   demand:{korangi:"Medium", gulshan:"High",   saddar:"High",   clifton:"Medium"} },
  { id:"juice",      name:"Juice (Carton)",           cost: 250, flavorText:"Bachon ke liye fresh juice chahiye.",           cat:"dairy",   demand:{korangi:"Low",    gulshan:"Medium", saddar:"Medium", clifton:"High"  } },
  { id:"bread",      name:"Double Roti (Bread)",      cost: 120, flavorText:"Subah ka nashta hai, bread chahiye!",           cat:"bakery",  demand:{korangi:"Low",    gulshan:"Medium", saddar:"Medium", clifton:"Low"   } },
  { id:"chips",      name:"Lays Chips (Masala)",      cost: 100, flavorText:"Bacho ke liye chips lena hai, masala wala.",    cat:"bakery",  demand:{korangi:"Low",    gulshan:"Medium", saddar:"High",   clifton:"Medium"} },
  { id:"biscuits",   name:"Biscuits (Britannia)",     cost: 50,  flavorText:"Chai ke saath biscuit chahiye.",                cat:"bakery",  demand:{korangi:"Medium", gulshan:"Medium", saddar:"High",   clifton:"Low"   } },
  { id:"frozen",     name:"Frozen / Packaged Food",   cost: 800, flavorText:"Ghar mein koi nahi, ready-to-eat chahiye.",     cat:"bakery",  demand:{korangi:"None",   gulshan:"Low",    saddar:"Medium", clifton:"High"  } },
  { id:"sabzi",      name:"Taza Sabzi (Mixed) 500 g", cost: 150, flavorText:"Aaj sabzi nahi bani, taza chahiye!",            cat:"produce", demand:{korangi:"High",   gulshan:"Low",    saddar:"Medium", clifton:"Medium"} },
  { id:"fruit",      name:"Mausami Phal (Fruit)",     cost: 300, flavorText:"Mehmano ke liye taza phal chahiye.",            cat:"produce", demand:{korangi:"Medium", gulshan:"Low",    saddar:"Medium", clifton:"High"  } },
  { id:"detergent",  name:"Detergent / Soap Bar",     cost: 200, flavorText:"Kapre dhone hain, sabun khatam ho gaya.",       cat:"care",    demand:{korangi:"High",   gulshan:"Medium", saddar:"Low",    clifton:"None"  } },
  { id:"shampoo",    name:"Shampoo (Bottle)",         cost: 400, flavorText:"Baal dhone ka shampoo chahiye.",                cat:"care",    demand:{korangi:"Medium", gulshan:"Medium", saddar:"Low",    clifton:"Medium"} },
  { id:"toothpaste", name:"Colgate Toothpaste",       cost: 150, flavorText:"Subah brush karna hai, paste khatam.",          cat:"care",    demand:{korangi:"None",   gulshan:"Low",    saddar:"Low",    clifton:"High"  } },
  { id:"mosquito",   name:"Mosquito Repellent",       cost: 100, flavorText:"Machhar bohot hain, koi spray hai?",            cat:"care",    demand:{korangi:"None",   gulshan:"None",   saddar:"Medium", clifton:"Low"   } },
  { id:"cleaning",   name:"Cleaning Supplies",        cost: 250, flavorText:"Ghar saaf karna hai, bartan saaf karne wala.",  cat:"care",    demand:{korangi:"Medium", gulshan:"Medium", saddar:"Low",    clifton:"Medium"} },
  { id:"mobileload", name:"Mobile Load (Rs 100)",     cost: 100, flavorText:"Mobile mein load daalna hai, jaldi!",           cat:"utility", demand:{korangi:"High",   gulshan:"Medium", saddar:"High",   clifton:"None"  } },
];

const SAUDA_CARDS = [
  { text: "From 50 rupees, buy some vegetables for 20 rupees.", cat: "produce" },
  { text: "In under 60 seconds, get a washing powder.", cat: "care" },
  { text: "Buy any of your favourite 3 fruits.", cat: "produce" },
  { text: "One biscuit is for 20 rupees. Buy as many as you can.", cat: "bakery" },
  { text: "Ammi has asked to bring one packet of biscuits and two chips.", cat: "bakery" },
  { text: "Buy 3 juices for 3 people.", cat: "dairy" },
  { text: "Take advice from Ginti Guru and purchase Mosquitto Repellent.", cat: "care" },
  { text: "Chachi has given 100 rupees to buy any 2 vegetables.", cat: "produce" },
  { text: "Dadi wants to cook Daal. Purchase the best one.", cat: "staples" },
  { text: "Get the cheapest Dahi.", cat: "dairy" },
  { text: "Phopho is in need of rice. Quickly purchase 1 kg rice.", cat: "staples" },
  { text: "You are hungry after school. Get something to eat and drink.", cat: "bakery" },
  { text: "Sister has to make milkshake. Get 1 dozen bananas and Milk.", cat: "dairy" },
  { text: "Abbu only prefers fresh bread. Get the most fresh bread.", cat: "bakery" },
  { text: "Get 2 healthy fruits and 2 healthy vegetables for yourself.", cat: "produce" },
  { text: "Mobile mein load daalna hai, jaldi!", cat: "utility" },
  { text: "Mehman aa rahe hain, chai banana hai!", cat: "staples" },
  { text: "Garmi mein thanda kuch do bhai!", cat: "dairy" },
  { text: "Ghar saaf karna hai, bartan saaf karne wala.", cat: "care" },
];

const ISLAMIC_TOOLS = [
  { id:"mud",  name:"Mudarabah",   urdu:"مضاربہ",
    desc:"A silent partnership. The investor (rab-ul-mal) provides capital; the entrepreneur (mudarib) provides skill. Profits are split at a pre-agreed ratio. Losses fall on the investor financially; the mudarib loses only effort.",
    eg:"A silent investor provides Rs 500,000. You manage the store. 75% profit to you, 25% to investor." },
  { id:"mush", name:"Musharakah",  urdu:"مشارکہ",
    desc:"Full joint partnership where both parties contribute capital AND share profit AND loss proportionally. Unlike Mudarabah, both are actively involved and bear financial risk.",
    eg:"You invest Rs 250,000; partner invests Rs 250,000. You both run the store and split all profit and loss 50/50." },
  { id:"mur",  name:"Murabaha",    urdu:"مرابحہ",
    desc:"Cost-plus sale. A financier buys goods and resells at a disclosed markup payable in installments. No interest — profit comes from a legitimate sale, not a loan.",
    eg:"Bank buys your shelving for Rs 50,000, sells it to you for Rs 55,000 over 3 months. No riba." },
  { id:"qarz", name:"Qarz-e-Hasna", urdu:"قرض حسنہ",
    desc:"A benevolent loan. The lender receives no interest or benefit. The borrower repays only the principal when able. An act of charity and community support.",
    eg:"A relative lends Rs 100,000 for stock. You repay Rs 100,000 only — no extra, no interest." },
];

const PROMOTION_OPTIONS = [
  { id:"none",     label:"Word of Mouth",   urdu:"زبانی تعریف", cost:0,    icon:"🗣️",
    desc:"Satisfied customers spread the word naturally.",
    detail:"Low reach but zero cost. Best if capital is tight.",
    bsc:{ financial:0,  customer:4,  internal:0 } },
  { id:"flyers", label:"Local Flyers & Posters",  urdu:"اشتہارات",  cost:5000,  icon:"📄",
    desc:"Distribute printed pamphlets in the local neighborhood.",
    detail:"Moderate reach at low cost. Good mid-option.",
    bsc:{ financial:-1, customer:7,  internal:2 } },
  { id:"social",   label:"Social Media Ads",  urdu:"سوشل میڈیا",  cost:15000, icon:"📱",
    desc:"Targeted ads on Facebook and Instagram for your area.",
    detail:"High reach and visibility — premium spend.",
    bsc:{ financial:2,  customer:10, internal:4 } },
  { id:"event",   label:"Community Event",  urdu:"تقریب",  cost:30000, icon:"🎪",
    desc:"Sponsor a local cricket match or community gathering.",
    detail:"Maximum brand recognition and loyalty.",
    bsc:{ financial:4,  customer:15, internal:6 } },
];

const DECISION_MATRIX: any = {
  location: {
    korangi:{ financial:5,  customer:8,  internal:6  },
    gulshan:{ financial:10, customer:6,  internal:8  },
    saddar: { financial:7,  customer:7,  internal:12 },
    clifton:{ financial:12, customer:4,  internal:3  },
  },
  scale: {
    counter:{ financial:5,  customer:4,  internal:4  },
    mini:   { financial:12, customer:10, internal:10 },
    dept:   { financial:15, customer:12, internal:14 },
  },
  mudarabah: {
    0:{ financial:5,  customer:-4, internal:-10 },
    1:{ financial:8,  customer:2,  internal:0   },
    2:{ financial:10, customer:4,  internal:5   },
    3:{ financial:12, customer:8,  internal:10  },
  },
};

const SETUP_STEPS = [
  { id:"I1", label:"Welcome & Capital",   Icon: Banknote    },
  { id:"I2", label:"Islamic Financing",   Icon: BookOpen    },
  { id:"D3", label:"Mudarabah Choice",    Icon: Users       },
  { id:"D1", label:"Location",            Icon: MapPin      },
  { id:"D2", label:"Store Scale",         Icon: Store       },
  { id:"D4", label:"Inventory Selection", Icon: Package     },
  { id:"P1", label:"Pricing Strategy",    Icon: Tag         },
  { id:"D5", label:"Promotion Plan",      Icon: Megaphone   },
  { id:"D6", label:"Open Store",          Icon: CheckCircle },
];

const INIT_STATE: GameState = {
  screen:"LANDING", playerName:"", 
  capital: BASE_CAPITAL, mudarabah:-1,
  stores: [{
    id: "", name: "", location: "", scale: "", selectedItems: [], stock: {},
    prices: { staples:"standard", dairy:"standard", bakery:"standard", produce:"standard", care:"standard", utility:"standard" }
  }],
  currentStoreIdx: 0,
  checkpoint:1, reqIdx:0, requests:[], results:[], cpHistory:[],
  growChoice:"", openAcc:[], readTools:[], reopening:false,
  setupPoints:{ financial:0, customer:0, internal:0 },
  promotionChoice:"",
};

const STAGGER = {
  container: { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } } },
  item:      { hidden: { opacity:0, y:20 }, show: { opacity:1, y:0, transition: { duration:0.35, ease:[0.25,0.46,0.45,0.94] } } },
};

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

const getLoc = (id: string) => LOCS.find(l=>l.id===id) ?? LOCS[0];
const getScale = (id: string) => SCALES.find(s=>s.id===id) ?? SCALES[0];
const getCat = (id: string) => CATS.find(c=>c.id===id)!;
const getItem = (id: string) => ALL_ITEMS.find(i=>i.id===id)!;

const calcInvCost = (stores: StoreData[]) => {
  return stores.reduce((total, store) => {
    return total + store.selectedItems.reduce((sum, id) => sum + (getItem(id).cost * UNITS_PER_ITEM), 0);
  }, 0);
};

const catStockFrom = (selectedItems: string[], stock: Record<string, number>) => {
  return CATS.map(cat => {
    const itemsInCat = Array.from(new Set([...selectedItems, ...Object.keys(stock)])).filter(id => getItem(id).cat === cat.id);
    const units = itemsInCat.reduce((sum, id) => sum + (stock[id] || 0), 0);
    return { ...cat, units, maxUnits: Math.max(units, itemsInCat.length * UNITS_PER_ITEM), hasItems: itemsInCat.length > 0 };
  }).filter(c => c.hasItems);
};

const getAdjustedItemDemand = (locId: string, item: any, cp: number): Demand => {
  let base = item.demand[locId] as Demand;
  if (cp === 2 && item.cat === 'dairy') return 'High';
  if (cp === 3 && item.cat === 'bakery') return 'High';
  if (cp === 4 && item.cat === 'staples') return 'High';
  if (cp === 5 && (item.cat === 'care' || item.cat === 'produce')) return 'High';
  return base;
};

const getEventName = (cp: number) => {
  switch(cp) {
    case 1: return "Normal Trading Days";
    case 2: return "Summer Heatwave (Dairy Demand ↑)";
    case 3: return "Winter Chills (Bakery Demand ↑)";
    case 4: return "Wedding Season (Staples Demand ↑)";
    case 5: return "Ramadan & Eid (Care & Produce Demand ↑)";
    default: return "Normal Trading Days";
  }
};

const computeMarketingFitPoints = (location: string, scale: string, selectedItems: string[], prices: Record<string, string>) => {
  const loc = getLoc(location);
  let placeFinancial = 0, placeInternal = 0;
  
  if (scale==="dept" && loc.basket>=400) placeFinancial = 3;
  if (scale==="dept" && loc.basket<300)  placeFinancial = -3;
  if (scale==="mini" && loc.footfall===4) placeInternal = 3;
  if (scale==="counter" && loc.footfall>=4) placeInternal = -3;

  const uniqueCats = new Set(selectedItems.map(id => getItem(id).cat)).size;
  const breadthBonus = Math.round((uniqueCats / 6) * 8);

  const filledCats = Array.from(new Set(selectedItems.map(id => getItem(id).cat)));
  const premiumCount = filledCats.filter(c => prices[c]==="premium").length;
  const valueCount   = filledCats.filter(c => prices[c]==="value").length;
  const ratio = Math.max(1, filledCats.length);

  let priceFitFinancial = 0, priceFitCustomer = 0;
  
  // Dynamic pricing strategy impact based on area
  if (loc.id === 'clifton' || loc.id === 'gulshan') {
    priceFitFinancial += Math.round(premiumCount/ratio * 6);
    priceFitCustomer  -= Math.round(valueCount/ratio   * 5);
  }
  if (loc.id === 'korangi') {
    priceFitCustomer  += Math.round(valueCount/ratio   * 6);
    priceFitCustomer  -= Math.round(premiumCount/ratio * 6);
    priceFitFinancial -= Math.round(premiumCount/ratio * 4);
  }

  // Scale impact on pricing
  if (scale === 'dept') {
    priceFitFinancial += Math.round(premiumCount/ratio * 3);
    priceFitCustomer -= Math.round(valueCount/ratio * 2);
  } else if (scale === 'counter') {
    priceFitCustomer += Math.round(valueCount/ratio * 3);
    priceFitFinancial -= Math.round(premiumCount/ratio * 3);
  }

  return {
    financial: placeFinancial + priceFitFinancial,
    customer:  breadthBonus + priceFitCustomer,
    internal:  placeInternal,
  };
};

const computeSetupPoints = (stores: StoreData[], mudarabah: number, promotionChoice: string) => {
  let totalF = 0, totalC = 0, totalI = 0;

  stores.forEach(store => {
    const l = DECISION_MATRIX.location[store.location] || {financial:0, customer:0, internal:0};
    const s = DECISION_MATRIX.scale[store.scale] || {financial:0, customer:0, internal:0};
    const m = DECISION_MATRIX.mudarabah[Math.max(0, mudarabah)] || {financial:0, customer:0, internal:0};
    
    const highCount = store.selectedItems.filter(id => (getItem(id).demand as any)[store.location]==="High").length;
    const ratio = Math.max(1, store.selectedItems.length);
    const mkt = computeMarketingFitPoints(store.location, store.scale, store.selectedItems, store.prices);
    
    totalF += l.financial + s.financial + m.financial + Math.round(highCount/ratio*10) + mkt.financial;
    totalC += l.customer  + s.customer  + m.customer  + Math.round(highCount/ratio*12) + mkt.customer;
    totalI += l.internal  + s.internal  + m.internal  + Math.round(highCount/ratio* 8) + mkt.internal;
  });

  const promo = PROMOTION_OPTIONS.find(p=>p.id===promotionChoice)?.bsc ?? {financial:0,customer:0,internal:0};
  
  return {
    financial: Math.round(totalF / stores.length) + promo.financial,
    customer:  Math.round(totalC / stores.length) + promo.customer,
    internal:  Math.round(totalI / stores.length) + promo.internal,
  };
};

const computeSaudaEffect = (fulfillPct: number) => {
  if (fulfillPct >= 83) return {financial:11, customer:8,  internal:5 };
  if (fulfillPct >= 67) return {financial:8,  customer:5,  internal:3 };
  if (fulfillPct >= 50) return {financial:4,  customer:2,  internal:0 };
  if (fulfillPct >= 33) return {financial:0,  customer:-2, internal:-3 };
  return {financial:-5, customer:-8, internal:-5 };
};

const getWeakestPillar = (cpHistory: CPResult[]) => {
  if (cpHistory.length === 0) return null;
  let f=0, c=0, i=0;
  cpHistory.forEach(cp => { f+=cp.pillarScores.financial; c+=cp.pillarScores.customer; i+=cp.pillarScores.internal; });
  const min = Math.min(f, c, i);
  if (min === f) return "financial";
  if (min === c) return "customer";
  return "internal";
};

const generateRequests = (stores: StoreData[], checkpoint: number): ReqItem[] => {
  const finalReqs: ReqItem[] = [];
  
  for (let i = 0; i < 12; i++) {
    const storeIdx = Math.floor(Math.random() * stores.length);
    const store = stores[storeIdx];
    
    const pool = ALL_ITEMS;
    let weighted: any[] = [];
    
    pool.forEach(item => {
      const demand = getAdjustedItemDemand(store.location, item, checkpoint);
      let weight = 0;
      if (demand === "High") weight = 5;
      else if (demand === "Medium") weight = 3;
      else if (demand === "Low") weight = 1;
      
      if (weight > 0) {
        const randomBoost = Math.floor(Math.random() * (checkpoint + 1));
        for(let j=0; j < weight + randomBoost; j++) weighted.push(item);
      }
    });
    
    if (weighted.length === 0) weighted = pool;
    const selectedItem = weighted[Math.floor(Math.random() * weighted.length)];
    
    const matchingCards = SAUDA_CARDS.filter(c => c.cat === selectedItem.cat);
    const flavorText = matchingCards.length > 0 
      ? matchingCards[Math.floor(Math.random() * matchingCards.length)].text 
      : selectedItem.flavorText;
      
    finalReqs.push({ 
      id: selectedItem.id, 
      name: selectedItem.name, 
      flavorText, 
      cat: selectedItem.cat, 
      cost: selectedItem.cost,
      storeIdx 
    });
  }
  
  return finalReqs;
};

const mkCPResult = (cp: number, results: ("fulfilled"|"missed")[], requests: ReqItem[], stores: StoreData[], mudarabah: number, setupPoints: any, promoCost: number): CPResult => {
  const fulfilled = results.filter(r=>r==="fulfilled").length;
  const missed    = results.length - fulfilled;
  
  let revenue = 0;
  let rent = 0;
  
  stores.forEach((store, idx) => {
    rent += getLoc(store.location).cost;
    
    const storeReqs = requests.filter(r => r.storeIdx === idx);
    const storeFulfilled = storeReqs.filter((_, i) => results[requests.indexOf(storeReqs[i])] === "fulfilled").length;
    
    const filledCats = Array.from(new Set(store.selectedItems.map(id => getItem(id).cat)));
    let avgM = 1.25;
    if (filledCats.length > 0) {
      const sumM = filledCats.reduce((sum, cat) => sum + (PRICE_TIERS.find(t=>t.id===store.prices[cat])?.mult || 1.25), 0);
      avgM = sumM / filledCats.length;
    }
    
    const loc = getLoc(store.location);
    revenue += Math.round(loc.basket * storeFulfilled * avgM * 30 * (1 + (cp-1)*0.08));
  });

  const invCost = calcInvCost(stores);
  const grossProfit = revenue - rent - invCost;
  
  const mudShare = MUD_SHARES[Math.max(0, mudarabah)];
  const mudCut   = mudarabah > 0 ? Math.round(Math.max(0, grossProfit) * mudShare) : 0;
  const profit   = grossProfit - mudCut - promoCost;
  
  const satisfaction = Math.min(100, Math.max(20, 100 - missed*6 + fulfilled));
  const recognition  = Math.min(100, 30 + cp*8 + fulfilled*4);
  const fulfillPct   = Math.round(fulfilled / Math.max(1, results.length) * 100);
  const saudaEffect  = computeSaudaEffect(fulfillPct);
  
  const pillarScores = {
    financial: Math.min(100, Math.max(0, 50 + setupPoints.financial + saudaEffect.financial)),
    customer:  Math.min(100, Math.max(0, 50 + setupPoints.customer  + saudaEffect.customer)),
    internal:  Math.min(100, Math.max(0, 50 + setupPoints.internal  + saudaEffect.internal)),
  };
  
  return { cp, fulfilled, missed, revenue, rent, invCost, mudCut, promoCost, profit, satisfaction, recognition, pillarScores, saudaEffect };
};

// ============================================================================
// PRIMITIVE UI COMPONENTS
// ============================================================================

const useEnterKey = (onEnter: () => void, disabled: boolean) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !disabled) {
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
        e.preventDefault();
        onEnter();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onEnter, disabled]);
};

const BgIcon = ({ Icon, className = "" }: { Icon: any, className?: string }) => (
  <div className={`absolute inset-0 overflow-hidden pointer-events-none flex items-center justify-center z-0 opacity-[0.04] ${className}`}>
    <Icon className="w-[150%] h-[150%] max-w-[800px] max-h-[800px] text-primary" strokeWidth={1} />
  </div>
);

const BUBBLY_LOGO_SVG = String.raw`<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" width="928" viewBox="0 0 928 1145" enable-background="new 0 0 928 1145" xml:space="preserve" height="1145"><path fill="#F7F7F7" opacity="1.000000" stroke="none" d="
M552.000000,1146.000000 
	C368.000000,1146.000000 184.500000,1146.000000 1.000000,1146.000000 
	C1.000000,764.333313 1.000000,382.666656 1.000000,1.000000 
	C310.333344,1.000000 619.666687,1.000000 929.000000,1.000000 
	C929.000000,382.666656 929.000000,764.333313 929.000000,1146.000000 
	C803.500000,1146.000000 678.000000,1146.000000 552.000000,1146.000000 
M538.022095,260.493958 
	C534.800476,252.516281 531.977295,244.349045 528.288025,236.593826 
	C512.675293,203.773895 490.406738,175.755615 464.819824,150.265442 
	C456.925934,142.401413 448.485809,135.068832 440.024567,127.809021 
	C438.722076,126.691513 435.252930,126.395859 434.058014,127.336372 
	C432.867493,128.273392 433.228973,131.239502 433.029114,133.327362 
	C432.991241,133.722977 433.553986,134.151367 433.766785,134.599228 
	C441.817505,151.543716 446.293030,168.987762 442.045868,187.905121 
	C438.341492,204.404663 431.353302,219.667740 423.064514,234.079437 
	C407.516785,261.112183 387.390472,284.912567 367.023651,308.405914 
	C337.674408,342.260681 314.758667,379.807343 300.336121,422.379303 
	C293.155670,443.574371 289.697357,465.024689 293.613495,487.431000 
	C297.794006,511.350342 308.271027,532.352356 322.313263,551.744995 
	C339.725281,575.791626 360.849915,596.285278 384.442261,614.150269 
	C395.144897,622.254700 406.629425,629.348877 417.995361,636.527588 
	C419.456451,637.450378 422.343201,636.116028 424.569550,635.827271 
	C424.222076,633.725403 424.644653,630.639587 423.409027,629.672607 
	C409.760986,618.992432 401.359924,604.527222 394.071960,589.350220 
	C389.734650,580.317871 386.290588,570.856567 382.055725,560.650146 
	C437.364288,560.650146 491.673553,560.650146 547.389099,560.650146 
	C542.787048,569.512451 539.052551,578.207703 534.023865,586.075745 
	C523.479187,602.574036 512.261169,618.642334 501.299927,634.873901 
	C499.591400,637.403870 497.274445,640.410828 500.652130,642.576782 
	C502.357300,643.670349 506.181152,643.145691 508.117096,641.903503 
	C516.783813,636.342468 525.301819,630.507263 533.535828,624.321655 
	C564.517029,601.047791 590.538269,573.379456 608.470093,538.662537 
	C619.620300,517.075256 626.229614,494.080414 628.791016,470.015320 
	C630.588013,453.132233 630.827332,436.216766 627.260925,419.376617 
	C623.254700,400.459778 616.215088,382.687042 607.884521,365.384216 
	C599.321594,347.598663 590.625305,329.856018 578.109436,314.357819 
	C575.692261,311.364685 572.950195,308.640381 568.848206,310.421539 
	C564.918396,312.127899 565.776550,316.052429 566.219238,319.249847 
	C568.063416,332.570801 567.418335,345.792786 564.961670,358.947754 
	C563.377441,367.430695 560.162048,375.184723 553.524170,381.056854 
	C548.989868,385.068054 543.801697,385.775970 538.348572,383.142853 
	C533.426453,380.766083 531.520203,376.497833 532.076355,371.273071 
	C532.580933,366.532806 532.990479,361.663910 534.417786,357.161041 
	C540.462524,338.090881 543.139587,318.441284 544.882996,298.643402 
	C546.025818,285.664764 542.047058,273.441956 538.022095,260.493958 
M751.080078,636.325195 
	C747.613281,618.623352 744.794739,600.761230 740.469299,583.271729 
	C737.158569,569.885010 731.039429,557.387512 723.011536,546.012756 
	C719.085083,540.449280 715.050476,540.721375 712.361450,546.891418 
	C706.660828,559.971436 701.118347,573.122681 695.693604,586.319824 
	C690.746582,598.354675 691.172058,610.123169 697.349854,621.814758 
	C704.486267,635.320679 710.828979,649.252014 718.157837,662.647705 
	C721.953796,669.585876 720.976135,675.490173 717.343994,681.770813 
	C712.621338,689.937073 705.112244,694.772827 697.071594,698.922424 
	C674.157898,710.747559 650.013733,719.490234 625.434204,727.075134 
	C593.079163,737.059692 560.153625,744.663086 526.578064,749.037170 
	C500.264862,752.465088 473.901611,756.276489 447.444214,757.612000 
	C421.405090,758.926331 395.177551,758.137573 369.111298,756.771545 
	C348.114075,755.671143 327.115112,753.081482 306.335846,749.776306 
	C285.999084,746.541443 266.508179,740.194336 248.185150,730.204773 
	C221.641693,715.733521 215.108612,686.826538 217.350723,664.257141 
	C218.964096,648.016785 225.745422,633.285645 234.000427,619.323547 
	C241.700348,606.300354 241.190109,608.024414 229.977493,598.696228 
	C226.413879,595.731506 223.215302,596.252258 220.994980,600.306030 
	C208.485123,623.145752 195.015213,645.466858 185.930054,670.078064 
	C177.923767,691.766724 174.860626,713.679321 179.449875,736.532654 
	C186.336884,770.828125 206.890732,794.142090 237.791306,808.845947 
	C274.536804,826.330994 314.226440,831.306824 354.117188,834.861084 
	C369.512970,836.232910 385.052338,835.992126 400.448547,837.360657 
	C420.012756,839.099670 439.350647,837.324463 458.610046,834.651184 
	C478.312164,831.916504 497.913025,828.411560 517.510193,824.970703 
	C550.521851,819.174438 583.226624,811.975769 614.890198,800.825317 
	C657.588318,785.789062 695.250244,762.913818 725.711975,728.848511 
	C749.359985,702.403076 757.032288,671.761963 751.080078,636.325195 
M495.830048,874.692749 
	C491.358917,872.144531 486.876587,869.615662 482.419495,867.043091 
	C476.824097,863.813599 475.310974,864.038391 471.796173,869.310974 
	C457.791595,890.319031 443.830841,911.356506 429.899628,932.413330 
	C426.459869,937.612732 426.949097,939.672668 432.153168,942.892822 
	C453.332153,955.997742 474.514374,969.097595 495.714142,982.168884 
	C501.984344,986.034851 503.210266,985.744507 507.356171,979.636780 
	C521.909546,958.196899 536.454590,936.751404 550.989929,915.299316 
	C554.466553,910.168213 554.046631,907.921753 548.796814,904.906433 
	C531.383606,894.904907 513.929138,884.975342 495.830048,874.692749 
z"></path><path fill="#6B0DAD" opacity="1.000000" stroke="none" d="
M538.131897,260.877441 
	C542.047058,273.441956 546.025818,285.664764 544.882996,298.643402 
	C543.139587,318.441284 540.462524,338.090881 534.417786,357.161041 
	C532.990479,361.663910 532.580933,366.532806 532.076355,371.273071 
	C531.520203,376.497833 533.426453,380.766083 538.348572,383.142853 
	C543.801697,385.775970 548.989868,385.068054 553.524170,381.056854 
	C560.162048,375.184723 563.377441,367.430695 564.961670,358.947754 
	C567.418335,345.792786 568.063416,332.570801 566.219238,319.249847 
	C565.776550,316.052429 564.918396,312.127899 568.848206,310.421539 
	C572.950195,308.640381 575.692261,311.364685 578.109436,314.357819 
	C590.625305,329.856018 599.321594,347.598663 607.884521,365.384216 
	C616.215088,382.687042 623.254700,400.459778 627.260925,419.376617 
	C630.827332,436.216766 630.588013,453.132233 628.791016,470.015320 
	C626.229614,494.080414 619.620300,517.075256 608.470093,538.662537 
	C590.538269,573.379456 564.517029,601.047791 533.535828,624.321655 
	C525.301819,630.507263 516.783813,636.342468 508.117096,641.903503 
	C506.181152,643.145691 502.357300,643.670349 500.652130,642.576782 
	C497.274445,640.410828 499.591400,637.403870 501.299927,634.873901 
	C512.261169,618.642334 523.479187,602.574036 534.023865,586.075745 
	C539.052551,578.207703 542.787048,569.512451 547.389099,560.650146 
	C491.673553,560.650146 437.364288,560.650146 382.055725,560.650146 
	C386.290588,570.856567 389.734650,580.317871 394.071960,589.350220 
	C401.359924,604.527222 409.760986,618.992432 423.409027,629.672607 
	C424.644653,630.639587 424.222076,633.725403 424.569519,635.827271 
	C422.343201,636.116028 419.456451,637.450378 417.995361,636.527588 
	C406.629425,629.348877 395.144897,622.254700 384.442261,614.150269 
	C360.849915,596.285278 339.725281,575.791626 322.313263,551.744995 
	C308.271027,532.352356 297.794006,511.350342 293.613495,487.431000 
	C289.697357,465.024689 293.155670,443.574371 300.336121,422.379303 
	C314.758667,379.807343 337.674408,342.260681 367.023651,308.405914 
	C387.390472,284.912567 407.516785,261.112183 423.064514,234.079437 
	C431.353302,219.667740 438.341492,204.404663 442.045868,187.905121 
	C446.293030,168.987762 441.817505,151.543716 433.766785,134.599228 
	C433.553986,134.151367 432.991241,133.722977 433.029114,133.327362 
	C433.228973,131.239502 432.867493,128.273392 434.058014,127.336372 
	C435.252930,126.395859 438.722076,126.691513 440.024567,127.809021 
	C448.485809,135.068832 456.925934,142.401413 464.819824,150.265442 
	C490.406738,175.755615 512.675293,203.773895 528.288025,236.593826 
	C531.977295,244.349045 534.800476,252.516281 538.131897,260.877441 
M383.353119,516.734497 
	C385.921875,516.829529 388.490570,517.006592 391.059357,517.007446 
	C441.134430,517.023743 491.209473,517.030334 541.284485,516.977783 
	C543.176514,516.975769 545.067810,516.360413 547.155457,515.214966 
	C546.988708,514.066956 546.943298,512.885498 546.637268,511.775848 
	C540.815430,490.665192 531.260376,471.657349 515.566101,456.013397 
	C499.119934,439.619995 484.926636,421.601746 475.656525,400.049225 
	C472.303680,392.253967 470.772186,384.221130 471.816589,375.836975 
	C472.750061,368.343109 474.130646,360.904877 475.301025,353.523560 
	C474.597015,354.092712 473.485657,354.779419 472.639404,355.707794 
	C462.579895,366.743805 451.857422,377.264404 442.659546,388.980560 
	C413.734009,425.825806 394.987610,467.792358 382.434418,512.684814 
	C382.147644,513.710449 382.791351,514.996277 383.353119,516.734497 
z"></path><path fill="#FD0280" opacity="1.000000" stroke="none" d="
M751.108398,636.781128 
	C757.032288,671.761963 749.359985,702.403076 725.711975,728.848511 
	C695.250244,762.913818 657.588318,785.789062 614.890198,800.825317 
	C583.226624,811.975769 550.521851,819.174438 517.510193,824.970703 
	C497.913025,828.411560 478.312164,831.916504 458.610046,834.651184 
	C439.350647,837.324463 420.012756,839.099670 400.448547,837.360657 
	C385.052338,835.992126 369.512970,836.232910 354.117188,834.861084 
	C314.226440,831.306824 274.536804,826.330994 237.791306,808.845947 
	C206.890732,794.142090 186.336884,770.828125 179.449875,736.532654 
	C174.860626,713.679321 177.923767,691.766724 185.930054,670.078064 
	C195.015213,645.466858 208.485123,623.145752 220.994980,600.306030 
	C223.215302,596.252258 226.413879,595.731506 229.977493,598.696228 
	C241.190109,608.024414 241.700348,606.300354 234.000427,619.323547 
	C225.745422,633.285645 218.964096,648.016785 217.350723,664.257141 
	C215.108612,686.826538 221.641693,715.733521 248.185150,730.204773 
	C266.508179,740.194336 285.999084,746.541443 306.335846,749.776306 
	C327.115112,753.081482 348.114075,755.671143 369.111298,756.771545 
	C395.177551,758.137573 421.405090,758.926331 447.444214,757.612000 
	C473.901611,756.276489 500.264862,752.465088 526.578064,749.037170 
	C560.153625,744.663086 593.079163,737.059692 625.434204,727.075134 
	C650.013733,719.490234 674.157898,710.747559 697.071594,698.922424 
	C705.112244,694.772827 712.621338,689.937073 717.343994,681.770813 
	C720.976135,675.490173 721.953796,669.585876 718.157837,662.647705 
	C710.828979,649.252014 704.486267,635.320679 697.349854,621.814758 
	C691.172058,610.123169 690.746582,598.354675 695.693604,586.319824 
	C701.118347,573.122681 706.660828,559.971436 712.361450,546.891418 
	C715.050476,540.721375 719.085083,540.449280 723.011536,546.012756 
	C731.039429,557.387512 737.158569,569.885010 740.469299,583.271729 
	C744.794739,600.761230 747.613281,618.623352 751.108398,636.781128 
z"></path><path fill="#FC0380" opacity="1.000000" stroke="none" d="
M496.160278,874.855469 
	C513.929138,884.975342 531.383606,894.904907 548.796814,904.906433 
	C554.046631,907.921753 554.466553,910.168213 550.989929,915.299316 
	C536.454590,936.751404 521.909546,958.196899 507.356171,979.636780 
	C503.210266,985.744507 501.984344,986.034851 495.714142,982.168884 
	C474.514374,969.097595 453.332153,955.997742 432.153168,942.892822 
	C426.949097,939.672668 426.459869,937.612732 429.899628,932.413330 
	C443.830841,911.356506 457.791595,890.319031 471.796173,869.310974 
	C475.310974,864.038391 476.824097,863.813599 482.419495,867.043091 
	C486.876587,869.615662 491.358917,872.144531 496.160278,874.855469 
z"></path><path fill="#F7F6F7" opacity="1.000000" stroke="none" d="
M383.001007,516.160706 
	C382.791351,514.996277 382.147644,513.710449 382.434418,512.684814 
	C394.987610,467.792358 413.734009,425.825806 442.659546,388.980560 
	C451.857422,377.264404 462.579895,366.743805 472.639404,355.707794 
	C473.485657,354.779419 474.597015,354.092712 475.301025,353.523560 
	C474.130646,360.904877 472.750061,368.343109 471.816589,375.836975 
	C470.772186,384.221130 472.303680,392.253967 475.656525,400.049225 
	C484.926636,421.601746 499.119934,439.619995 515.566101,456.013397 
	C531.260376,471.657349 540.815430,490.665192 546.637268,511.775848 
	C546.943298,512.885498 546.988708,514.066956 546.593628,515.606567 
	C510.298737,515.996643 474.565613,515.976685 438.832489,516.001160 
	C420.221954,516.013916 401.611511,516.104980 383.001007,516.160706 
z"></path><path fill="#5D2484" opacity="1.000000" stroke="none" d="
M383.177063,516.447632 
	C401.611511,516.104980 420.221954,516.013916 438.832489,516.001160 
	C474.565613,515.976685 510.298737,515.996643 546.495667,516.014526 
	C545.067810,516.360413 543.176514,516.975769 541.284485,516.977783 
	C491.209473,517.030334 441.134430,517.023743 391.059357,517.007446 
	C388.490570,517.006592 385.921875,516.829529 383.177063,516.447632 
z"></path></svg>`;

const BubblyLogo = ({ className = "w-16 h-16" }: { className?: string }) => (
  <img
    src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(BUBBLY_LOGO_SVG)}`}
    className={`${className} object-contain`}
    alt="Bubbly Bazaar Logo"
  />
);
const DemandBadge = ({ level }: { level: Demand }) => {
  const colors = {
    High: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Medium: "bg-amber-50 text-amber-700 border-amber-200",
    Low: "bg-red-50 text-red-700 border-red-200",
    None: "bg-gray-50 text-gray-500 border-gray-200"
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${colors[level]}`}>{level}</span>;
};

const Stars = ({ n, max = 5 }: { n: number, max?: number }) => (
  <div className="flex gap-0.5">
    {Array.from({ length: max }).map((_, i) => (
      <span key={i} className={`text-sm ${i < n ? 'text-primary' : 'text-gray-200'}`}>★</span>
    ))}
  </div>
);

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500 mb-2">{children}</p>
);

const MetricTile = ({ label, value, sub, accent }: { label: string, value: React.ReactNode, sub?: string, accent?: boolean }) => (
  <div className="game-card bg-white rounded-2xl p-4 flex flex-col justify-center relative z-10">
    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 mb-1">{label}</p>
    <div className={`text-2xl font-bold ${accent ? 'text-primary' : 'text-gray-900'}`}>{value}</div>
    {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
  </div>
);

const BottomNav = ({ onBack, onNext, nextLabel = "Next", disabled, secondaryLabel, onSecondary }: any) => {
  useEnterKey(() => { if (onNext && !disabled) onNext(); }, disabled);

  return (
    <div className="mt-8 pt-6 border-t-2 border-gray-200 flex items-center justify-between w-full pb-8 shrink-0 relative z-20">
      <div>
        {onBack && (
          <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900 transition-colors bg-gray-100 px-4 py-2.5 rounded-xl border-2 border-gray-200 hover:bg-gray-200">
            <ChevronLeft size={16} /> <span className="hidden sm:inline">Back</span>
          </button>
        )}
      </div>
      <div className="flex items-center gap-3">
        {secondaryLabel && onSecondary && (
          <button onClick={onSecondary} className="px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-xl border-2 border-transparent transition-colors hidden sm:block">
            {secondaryLabel}
          </button>
        )}
        {onNext && (
          <button 
            onClick={onNext} 
            disabled={disabled}
            className={`game-card flex items-center gap-2 px-6 md:px-8 py-3 rounded-xl text-sm font-bold text-white transition-all ${disabled ? 'bg-primary/50 cursor-not-allowed border-primary/50' : 'bg-primary hover:bg-primary/90 border-pink-700'}`}
          >
            {nextLabel} <ChevronRight size={18} />
          </button>
        )}
      </div>
    </div>
  );
};

const AnimatedNumber = ({ value, prefix = "", suffix = "" }: { value: number, prefix?: string, suffix?: string }) => {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  
  useEffect(() => {
    let start = performance.now();
    const duration = 700;
    const startVal = prev.current;
    const endVal = value;
    
    if (startVal === endVal) return;

    let animationFrameId: number;
    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(startVal + (endVal - startVal) * ease));
      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        prev.current = endVal;
      }
    };
    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [value]);
  
  return <span>{prefix}{display.toLocaleString()}{suffix}</span>;
};

const StoreTypeIcon = ({ scale, size = 20, className = "" }: { scale: string, size?: number, className?: string }) => {
  if (scale === "dept") return <Building2 size={size} className={className} />;
  if (scale === "mini") return <ShoppingCart size={size} className={className} />;
  return <Store size={size} className={className} />;
};

// ============================================================================
// BUBBLY AI CHATBOT
// ============================================================================

const BubblyChat = ({ gs }: { gs: GameState }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{role: 'user'|'model', text: string}[]>([
    { role: 'model', text: 'Assalam o Alaikum! I am Bubbly. I can help you understand the 4Ps of Marketing, Islamic Finance, or give you tips on your Kiryana store. Ask me anything!' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    const userMsg = input.trim();
    setInput('');
    const newMsgs: {role: 'user'|'model', text: string}[] = [...messages, { role: 'user', text: userMsg }];
    setMessages(newMsgs);
    setIsLoading(true);

    try {
      const apiKey = process.env.API_KEY;
      if (!apiKey) {
        setMessages([...newMsgs, { role: 'model', text: "Oops! API Key is missing. I can't connect right now." }]);
        setIsLoading(false);
        return;
      }

      const ai = new GoogleGenAI({ apiKey, vertexai: true });
      
      const systemInstruction = `You are Bubbly, a friendly 10-year-old Pakistani girl and an expert tutor in business, the 4Ps of marketing, Islamic Finance, and the Balanced Scorecard. You help the user who is playing the 'Bubbly Bazaar' Kiryana store simulation. 
      Current Game Context: 
      - Player Name: ${gs.playerName || 'Not set'}
      - Capital: Rs ${gs.capital}
      - Checkpoint: ${gs.checkpoint}
      Keep answers concise, encouraging, and use a bit of Roman Urdu (like "Zabardast!", "Bohat khoob!"). Do not break character.`;

      const contents = newMsgs.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: contents,
        config: {
          systemInstruction,
          temperature: 0.7,
        }
      });

      setMessages([...newMsgs, { role: 'model', text: response.text }]);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages([...newMsgs, { role: 'model', text: "Sorry, I'm having trouble connecting right now. Please try again later!" }]);
    }
    setIsLoading(false);
  };

  return (
    <>
      {/* Floating Action Button - Draggable */}
      <motion.div 
        drag 
        dragMomentum={false}
        className="fixed z-50"
        style={{ bottom: 24, right: 24 }}
      >
        <button 
          onClick={() => setIsOpen(true)}
          className={`w-16 h-16 rounded-full bg-white shadow-2xl flex items-center justify-center hover:scale-105 transition-transform border-4 border-primary cursor-grab active:cursor-grabbing p-2 ${isOpen ? 'hidden' : 'block'}`}
        >
          <BubblyLogo className="w-full h-full" />
          <div className="absolute -top-2 -right-2 bg-amber-400 text-amber-900 text-[10px] font-bold px-2 py-1 rounded-full border-2 border-white shadow-sm flex items-center gap-1 pointer-events-none">
            <Sparkles size={10} /> Tutor
          </div>
        </button>
      </motion.div>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-50 w-80 sm:w-96 h-[500px] bg-white rounded-2xl shadow-2xl border-4 border-primary flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="bg-primary p-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full border-2 border-white bg-white p-1 flex items-center justify-center">
                  <BubblyLogo className="w-full h-full" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-lg leading-tight">Bubbly AI</h3>
                  <p className="text-[10px] uppercase tracking-wider text-white/80 font-semibold">Your Business Tutor</p>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50 flex flex-col gap-3">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-gray-900 text-white rounded-tr-sm' : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm'}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-200 p-3 rounded-2xl rounded-tl-sm shadow-sm flex gap-1">
                    <span className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                    <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                    <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 bg-white border-t border-gray-200 flex gap-2">
              <input 
                type="text" 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask Bubbly a question..."
                className="flex-1 bg-gray-100 border-transparent focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-xl px-4 py-2 text-sm transition-all"
              />
              <button 
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="bg-primary text-white p-2.5 rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send size={18} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

// ============================================================================
// SIDEBAR
// ============================================================================

const Sidebar = ({ gs, go }: { gs: GameState, go: any }) => {
  const [collapsed, setCollapsed] = useState(false);
  
  const isSetup = SETUP_STEPS.some(s => s.id === gs.screen) && gs.cpHistory.length === 0 && !gs.reopening;
  const isGame = ["G1", "G2", "G4", "BSC", "BSC_FINAL", "D7"].includes(gs.screen) || gs.reopening;
  const isFinal = gs.screen === "FINAL";

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setCollapsed(true);
      } else {
        setCollapsed(false);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', collapsed ? '72px' : '260px');
  }, [collapsed]);

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 72 : 260 }}
      transition={{ type: "spring", stiffness: 340, damping: 32 }}
      className="bg-[#0D0D1A] h-screen flex flex-col flex-shrink-0 border-r-4 border-gray-900 relative z-50 shadow-2xl"
    >
      {/* COLLAPSED VIEW */}
      <div className={`absolute inset-0 flex flex-col transition-opacity duration-200 ${collapsed ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="p-4 flex flex-col items-center gap-4">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 border-2 border-pink-700 p-1">
            <BubblyLogo className="w-full h-full" />
          </div>
          <button onClick={() => setCollapsed(false)} className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
            <PanelLeftOpen size={20} />
          </button>
        </div>
        <div className="w-full h-px bg-white/10 my-2" />
        
        <div className="flex-1 overflow-y-auto dark-scroll flex flex-col items-center gap-3 py-4">
          {gs.stores[0]?.scale && (
            <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center mb-2 border border-primary/30">
              <StoreTypeIcon scale={gs.stores[0].scale} size={20} />
            </div>
          )}
          
          {isSetup && SETUP_STEPS.map((step, i) => {
            const currentIdx = SETUP_STEPS.findIndex(s => s.id === gs.screen);
            const isDone = i < currentIdx;
            const isCurrent = i === currentIdx;
            return (
              <button key={step.id} onClick={() => isDone && go(step.id)} disabled={!isDone && !isCurrent} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors border-2 ${isDone ? 'bg-primary/20 text-primary border-primary/30 cursor-pointer hover:bg-primary/30' : isCurrent ? 'bg-primary text-white border-pink-700' : 'bg-white/5 text-white/20 border-transparent cursor-not-allowed'}`}>
                {isDone ? <CheckCircle size={16} /> : <step.Icon size={18} />}
              </button>
            );
          })}

          {isGame && (
            <div className="flex flex-col items-center gap-2">
              {Array.from({length: 5}).map((_, i) => (
                <div key={i} className={`w-2 h-2 rounded-full ${i < gs.checkpoint ? 'bg-primary' : 'bg-white/15'}`} />
              ))}
              {gs.results.length > 0 && (
                <div className="mt-4 flex flex-col items-center gap-1 text-[10px] font-bold">
                  <span className="text-emerald-400">{gs.results.filter(r=>r==="fulfilled").length}</span>
                  <span className="text-white/20">/</span>
                  <span className="text-red-400">{gs.results.filter(r=>r==="missed").length}</span>
                </div>
              )}
            </div>
          )}

          {isFinal && <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30"><Trophy size={20} /></div>}
        </div>

        <div className="p-4 flex flex-col items-center border-t border-white/10 bg-black/20">
          <DollarSign size={16} className="text-primary mb-1" />
          <span className="text-xs font-bold text-white">{Math.floor(gs.capital/1000)}k</span>
        </div>
      </div>

      {/* EXPANDED VIEW */}
      <div className={`absolute inset-0 flex flex-col transition-opacity duration-200 ${!collapsed ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="p-6 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 border-2 border-pink-700 p-1">
              <BubblyLogo className="w-full h-full" />
            </div>
            <div>
              <h1 className="text-white font-display font-bold leading-tight">Bubbly Bazaar</h1>
              <p className="text-[9px] uppercase tracking-widest text-primary font-semibold">Financial Simulation</p>
            </div>
          </div>
          <button onClick={() => setCollapsed(true)} className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
            <PanelLeftClose size={18} />
          </button>
        </div>

        {gs.stores[0]?.name && (
          <div className="px-6 mb-6">
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center gap-3">
              <div className="p-2 bg-primary/20 text-primary rounded-lg">
                <StoreTypeIcon scale={gs.stores[0].scale} size={16} />
              </div>
              <div>
                <p className="text-[10px] text-white/40 uppercase tracking-wider">Your Store</p>
                <p className="text-sm font-bold text-white truncate max-w-[140px]">{gs.stores[0].name}</p>
                <p className="text-[10px] text-white/60 mt-0.5">ID: {gs.stores[0].id || 'Pending'}</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto dark-scroll px-6 pb-6">
          {gs.screen === "LANDING" && (
            <div className="bg-white/5 rounded-xl p-4 text-center border border-white/10">
              <div className="text-4xl mb-2">🏪</div>
              <p className="text-sm text-white/80">Enter your details to begin the simulation.</p>
            </div>
          )}

          {gs.stores.map((store, idx) => store.name && (
            <div key={idx} className="mb-4">
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center gap-3">
                <div className="p-2 bg-primary/20 text-primary rounded-lg">
                  <StoreTypeIcon scale={store.scale} size={16} />
                </div>
                <div>
                  <p className="text-[10px] text-white/40 uppercase tracking-wider">Store {idx + 1}</p>
                  <p className="text-sm font-bold text-white truncate max-w-[140px]">{store.name}</p>
                  <p className="text-[10px] text-white/60 mt-0.5">ID: {store.id || 'Pending'}</p>
                </div>
              </div>
            </div>
          ))}

          {isSetup && (
            <div>
              <SectionLabel>Setup Progress</SectionLabel>
              <div className="flex flex-col gap-1">
                {SETUP_STEPS.map((step, i) => {
                  const currentIdx = SETUP_STEPS.findIndex(s => s.id === gs.screen);
                  const isDone = i < currentIdx;
                  const isCurrent = i === currentIdx;
                  return (
                    <button 
                      key={step.id} 
                      onClick={() => isDone && go(step.id)}
                      disabled={!isDone && !isCurrent}
                      className={`flex items-center gap-3 p-2.5 rounded-lg text-sm transition-all text-left border-2 ${isDone ? 'hover:bg-white/5 cursor-pointer text-white/65 border-transparent' : isCurrent ? 'bg-primary/15 text-white font-semibold border-primary/30' : 'opacity-25 cursor-not-allowed text-white border-transparent'}`}
                    >
                      <div className={`w-7 h-7 rounded-md flex items-center justify-center ${isDone ? 'bg-emerald-500/20 text-emerald-400' : isCurrent ? 'bg-primary text-white' : 'bg-white/10'}`}>
                        {isDone ? <CheckCircle size={14} /> : <step.Icon size={14} />}
                      </div>
                      <span className="flex-1">{step.label}</span>
                      {isDone && <ChevronRight size={14} className="text-white/20" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {isGame && (
            <div className="space-y-6">
              <div>
                <SectionLabel>Simulation Status</SectionLabel>
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-bold text-white">Checkpoint {gs.checkpoint}/5</span>
                    <div className="flex gap-1">
                      {Array.from({length: 5}).map((_, i) => (
                        <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < gs.checkpoint ? 'bg-primary' : 'bg-white/15'}`} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {gs.requests.length > 0 && (
                <div>
                  <SectionLabel>Round Progress</SectionLabel>
                  <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden mb-3">
                      <div className="h-full bg-primary transition-all duration-300" style={{ width: `${(gs.results.length / gs.requests.length) * 100}%` }} />
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="bg-emerald-500/10 rounded-lg p-2">
                        <p className="text-[10px] text-emerald-400/70 uppercase">Fulfilled</p>
                        <p className="text-lg font-bold text-emerald-400">{gs.results.filter(r=>r==="fulfilled").length}</p>
                      </div>
                      <div className="bg-red-500/10 rounded-lg p-2">
                        <p className="text-[10px] text-red-400/70 uppercase">Missed</p>
                        <p className="text-lg font-bold text-red-400">{gs.results.filter(r=>r==="missed").length}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {isFinal && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-6 text-center">
              <Trophy size={32} className="text-amber-400 mx-auto mb-3" />
              <h3 className="text-white font-bold mb-1">Simulation Complete!</h3>
              <p className="text-xs text-white/60">5 Checkpoints Finished</p>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-white/10 bg-[#0a0a14]">
          <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Capital in Hand</p>
          <div className="text-2xl font-bold text-primary font-display">
            <AnimatedNumber value={gs.capital} prefix="Rs " />
          </div>
        </div>
      </div>
    </motion.aside>
  );
};

// ============================================================================
// SCREENS
// ============================================================================

const ScreenLanding = ({ gs, go, setGs }: ScreenProps) => {
  const canProceed = gs.playerName.length >= 2 && gs.stores[0].name.length >= 2;

  return (
    <div className="flex flex-col md:flex-row h-full w-full bg-background overflow-y-auto">
      <div className="w-full md:w-1/2 bg-gradient-to-br from-[#0D0D1A] via-[#1a1030] to-[#0D0D1A] p-8 md:p-12 flex flex-col justify-center min-h-screen md:min-h-full relative">
        <div className="absolute inset-0 bg-primary/10 rounded-full blur-[120px] mix-blend-screen pointer-events-none" style={{ transform: 'translate(-20%, -20%) scale(1.5)' }} />
        
        <div className="relative z-10 max-w-lg mx-auto w-full">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-2xl shadow-primary/30 border-2 border-pink-700 shrink-0 p-2">
              <BubblyLogo className="w-full h-full" />
            </div>
            <h1 className="text-4xl md:text-5xl font-display font-bold text-white tracking-tight">
              Bubbly <span className="text-primary">Bazaar</span>
            </h1>
          </div>

          <div className="bg-white/8 border border-white/15 rounded-2xl p-6 mb-6 backdrop-blur-sm">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">What You Will Learn</h3>
            <div className="space-y-4">
              <div className="flex gap-3"><span className="text-xl">🏷️</span><div><p className="text-white font-semibold text-sm">4Ps of Marketing</p><p className="text-white/60 text-xs">Apply Product, Price, Place & Promotion in a real business context</p></div></div>
              <div className="flex gap-3"><span className="text-xl">🕌</span><div><p className="text-white font-semibold text-sm">Islamic Finance Tools</p><p className="text-white/60 text-xs">Understand Mudarabah, Musharakah, Murabaha & Qarz-e-Hasna</p></div></div>
              <div className="flex gap-3"><span className="text-xl">🔍</span><div><p className="text-white font-semibold text-sm">Consumer Research</p><p className="text-white/60 text-xs">See how knowing your market drives inventory, pricing & location decisions</p></div></div>
              <div className="flex gap-3"><span className="text-xl">📊</span><div><p className="text-white font-semibold text-sm">Balanced Scorecard</p><p className="text-white/60 text-xs">Measure performance across Financial, Customer & Internal pillars</p></div></div>
            </div>
          </div>

          <div className="bg-primary/15 border border-primary/30 rounded-2xl p-6 mb-8">
            <h3 className="text-sm font-bold text-primary uppercase tracking-wider mb-3">Learning Outcomes</h3>
            <ul className="space-y-2 text-sm text-white/80">
              <li className="flex gap-2"><span className="text-primary">✓</span> Analyse how Product, Price, Place & Promotion decisions interact</li>
              <li className="flex gap-2"><span className="text-primary">✓</span> Evaluate Shariah-compliant financing options and their trade-offs</li>
              <li className="flex gap-2"><span className="text-primary">✓</span> Recognise how consumer research prevents costly mistakes</li>
              <li className="flex gap-2"><span className="text-primary">✓</span> Interpret a Balanced Scorecard to identify strengths and weaknesses</li>
              <li className="flex gap-2"><span className="text-primary">✓</span> Apply growth strategy decisions based on financial data</li>
            </ul>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white/5 rounded-xl p-3 text-center border border-white/10"><span className="block text-xl mb-1">📦</span><span className="text-xs text-white/80 font-medium">5 Checkpoints</span></div>
            <div className="bg-white/5 rounded-xl p-3 text-center border border-white/10"><span className="block text-xl mb-1">🏪</span><span className="text-xs text-white/80 font-medium">Live Inventory</span></div>
            <div className="bg-white/5 rounded-xl p-3 text-center border border-white/10"><span className="block text-xl mb-1">⏱️</span><span className="text-xs text-white/80 font-medium">Timed Decisions</span></div>
          </div>
        </div>
      </div>

      <div className="w-full md:w-1/2 bg-white/90 backdrop-blur-sm p-8 md:p-12 flex flex-col justify-center items-center min-h-screen md:min-h-full relative z-10">
        <div className="w-full max-w-md relative z-10">
          <h2 className="text-3xl font-display font-bold text-gray-900 mb-2">Let's get started</h2>
          <p className="text-gray-500 mb-8">Enter your details to open your store in Karachi.</p>

          <div className="space-y-5 mb-8">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Player Name</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><User size={18} className="text-gray-400" /></div>
                <input 
                  type="text" 
                  value={gs.playerName} 
                  onChange={e => setGs(p => ({ ...p, playerName: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && canProceed && go("I1")}
                  placeholder="e.g. Ahmed Raza" 
                  className="block w-full pl-10 pr-3 py-3 border-2 border-gray-200 rounded-xl focus:ring-0 focus:border-primary transition-all"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Store Name</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Store size={18} className="text-gray-400" /></div>
                <input 
                  type="text" 
                  value={gs.stores[0].name} 
                  onChange={e => setGs(p => {
                    const newStores = [...p.stores];
                    newStores[0].name = e.target.value;
                    return { ...p, stores: newStores };
                  })}
                  onKeyDown={e => e.key === 'Enter' && canProceed && go("I1")}
                  placeholder="e.g. Raza General Store" 
                  className="block w-full pl-10 pr-3 py-3 border-2 border-gray-200 rounded-xl focus:ring-0 focus:border-primary transition-all"
                />
              </div>
            </div>
          </div>

          <AnimatePresence>
            {canProceed && (
              <motion.div 
                initial={{ opacity: 0, height: 0, y: 10 }} 
                animate={{ opacity: 1, height: 'auto', y: 0 }} 
                exit={{ opacity: 0, height: 0, y: -10 }}
                className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-4 mb-8"
              >
                <p className="text-sm text-emerald-800 leading-relaxed">
                  Welcome, <strong className="font-bold">{gs.playerName}</strong>! You're about to open <strong className="font-bold">{gs.stores[0].name}</strong> — starting capital: <strong>Rs 500,000</strong>.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <button 
            onClick={() => go("I1")} 
            disabled={!canProceed}
            className={`game-card w-full py-3.5 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all ${canProceed ? 'bg-primary text-white hover:bg-primary/90 border-pink-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200'}`}
          >
            Start Simulation <ChevronRight size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

const ScreenI1 = ({ gs, go, setGs }: ScreenProps) => (
  <div className="flex-1 overflow-y-auto p-4 md:p-8 relative flex flex-col">
    <BgIcon Icon={Banknote} />
    <div className="flex-1 max-w-4xl mx-auto w-full relative z-10">
      <div className="flex justify-between items-end mb-8">
        <h1 className="text-3xl font-display font-bold text-gray-900">Assalam u Alaikum, {gs.playerName}!</h1>
      </div>

      <div className="game-card bg-gradient-to-br from-primary to-pink-600 rounded-2xl p-8 text-white mb-8 border-pink-700">
        <p className="text-sm font-semibold uppercase tracking-widest text-white/80 mb-2">Starting Capital</p>
        <div className="text-5xl font-display font-bold mb-8">Rs 500,000</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm border border-white/20"><span className="block text-2xl mb-2">🕌</span><p className="font-semibold text-sm">Islamic Finance</p></div>
          <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm border border-white/20"><span className="block text-2xl mb-2">📦</span><p className="font-semibold text-sm">Real Inventory</p></div>
          <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm border border-white/20"><span className="block text-2xl mb-2">🏁</span><p className="font-semibold text-sm">5 Checkpoints</p></div>
        </div>
      </div>

      <SectionLabel>Your Journey</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="game-card bg-white p-4 rounded-xl text-center"><div className="w-10 h-10 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-3 text-gray-500 font-bold">1</div><p className="font-semibold text-sm">Setup Store</p></div>
        <div className="game-card bg-white p-4 rounded-xl text-center"><div className="w-10 h-10 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-3 text-gray-500 font-bold">2</div><p className="font-semibold text-sm">Deliveries</p></div>
        <div className="game-card bg-white p-4 rounded-xl text-center"><div className="w-10 h-10 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-3 text-gray-500 font-bold">3</div><p className="font-semibold text-sm">Scorecard</p></div>
        <div className="game-card bg-white p-4 rounded-xl text-center"><div className="w-10 h-10 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-3 text-gray-500 font-bold">4</div><p className="font-semibold text-sm">Grow</p></div>
      </div>

      <div className="game-card bg-amber-50 border-amber-200 rounded-xl p-5 flex gap-4">
        <AlertTriangle className="text-amber-500 shrink-0" />
        <div>
          <h4 className="font-bold text-amber-800 mb-1">Pro Tip: Consumer Research</h4>
          <p className="text-sm text-amber-700">Pay close attention to the demand in different locations. Stocking the wrong items will lead to missed sales and wasted capital!</p>
        </div>
      </div>
    </div>
    <BottomNav onNext={() => go("I2")} />
  </div>
);

const ScreenI2 = ({ gs, go, setGs }: ScreenProps) => {
  const allRead = gs.readTools.length === 4;

  const toggleTool = (id: string) => {
    setGs(prev => {
      const open = prev.openAcc.includes(id) ? prev.openAcc.filter(x => x !== id) : [...prev.openAcc, id];
      const read = prev.readTools.includes(id) ? prev.readTools : [...prev.readTools, id];
      return { ...prev, openAcc: open, readTools: read };
    });
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 relative flex flex-col">
      <BgIcon Icon={BookOpen} />
      <div className="flex-1 max-w-4xl mx-auto w-full relative z-10">
        <div className="flex justify-between items-end mb-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">Islamic Financing Tools</h1>
            <p className="text-gray-500">Understand your options before seeking capital.</p>
          </div>
        </div>

        <div className="mb-8">
          <div className="flex justify-between text-sm font-semibold mb-2">
            <span className="text-gray-600">Reading Progress</span>
            <span className="text-primary">{gs.readTools.length} / 4</span>
          </div>
          <div className="h-3 w-full bg-gray-200 rounded-full overflow-hidden border border-gray-300">
            <div className="h-full bg-primary transition-all duration-500" style={{ width: `${(gs.readTools.length / 4) * 100}%` }} />
          </div>
        </div>

        {!allRead && (
          <div className="bg-blue-50 border-2 border-blue-200 text-blue-800 px-4 py-3 rounded-xl text-sm font-bold mb-6 flex items-center gap-2">
            <Info size={18} /> Read all 4 tools to continue ({4 - gs.readTools.length} remaining).
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ISLAMIC_TOOLS.map(tool => {
            const isOpen = gs.openAcc.includes(tool.id);
            const isRead = gs.readTools.includes(tool.id);
            return (
              <div key={tool.id} className={`game-card bg-white rounded-xl transition-all ${isOpen ? 'border-primary' : isRead ? 'border-gray-200' : 'border-gray-300'}`}>
                <button onClick={() => toggleTool(tool.id)} className="w-full px-5 py-4 flex items-center justify-between text-left">
                  <div className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${isRead ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                      {isRead ? <CheckCircle size={14} /> : <span className="w-2 h-2 bg-gray-300 rounded-full" />}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">{tool.name}</h3>
                      <p className="text-xs text-gray-500 font-display">{tool.urdu}</p>
                    </div>
                  </div>
                  {isOpen ? <ChevronUp size={20} className="text-gray-400" /> : <ChevronDown size={20} className="text-gray-400" />}
                </button>
                <AnimatePresence>
                  {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="px-5 pb-5 pt-2 border-t border-gray-100">
                        <p className="text-sm text-gray-600 leading-relaxed mb-4">{tool.desc}</p>
                        <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                          <p className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-1">Example</p>
                          <p className="text-sm text-amber-900">{tool.eg}</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
      <BottomNav onBack={() => go("I1")} onNext={() => go("D3")} disabled={!allRead} />
    </div>
  );
};

const ScreenD3 = ({ gs, go, setGs }: ScreenProps) => {
  const sel = gs.mudarabah;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 relative flex flex-col">
      <BgIcon Icon={Users} />
      <div className="flex-1 max-w-5xl mx-auto w-full relative z-10">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">Mudarabah Partnership</h1>
            <p className="text-gray-500">Choose an investor to boost your starting capital.</p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-8">
          <div className="w-full md:w-2/3">
            <motion.div variants={STAGGER.container} initial="hidden" animate="show" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {MUD_TIERS.map((tier, i) => (
                <motion.button
                  key={tier.id} variants={STAGGER.item}
                  onClick={() => setGs(p => ({ ...p, mudarabah: tier.id }))}
                  className={`game-card text-left p-5 rounded-xl transition-all ${sel === tier.id ? 'border-primary bg-primary/5' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-bold text-gray-900">{tier.name}</h3>
                    {sel === tier.id && <CheckCircle size={20} className="text-primary" />}
                  </div>
                  <p className="text-xs text-gray-500 mb-4 h-8">{tier.desc}</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 font-medium">Capital Top-up</span>
                      <span className="font-bold text-emerald-600">+Rs {tier.topUp.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 font-medium">Investor Share</span>
                      <span className="font-bold text-red-500">{tier.share}</span>
                    </div>
                  </div>
                </motion.button>
              ))}
            </motion.div>
          </div>

          <div className="w-full md:w-1/3">
            <div className="sticky top-8 game-card bg-white rounded-xl p-6">
              <h3 className="font-bold text-gray-900 mb-4">Partnership Summary</h3>
              {sel >= 0 ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-4 border-b border-gray-100">
                    <span className="text-sm text-gray-500 font-medium">Base Capital</span>
                    <span className="font-bold">Rs {BASE_CAPITAL.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center pb-4 border-b border-gray-100">
                    <span className="text-sm text-gray-500 font-medium">Investor Top-up</span>
                    <span className="font-bold text-emerald-600">+Rs {MUD_TIERS[sel].topUp.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <span className="text-sm font-bold text-gray-900">Total Capital</span>
                    <span className="text-xl font-bold text-primary">Rs {(BASE_CAPITAL + MUD_TIERS[sel].topUp).toLocaleString()}</span>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 mt-4 border border-gray-200">
                    <p className="text-xs text-gray-600 text-center">You will keep <strong className="text-gray-900">{100 - parseInt(MUD_TIERS[sel].share)}%</strong> of all gross profits.</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-8 font-medium">Select a partnership tier to see your total capital.</p>
              )}
            </div>
          </div>
        </div>
      </div>
      <BottomNav 
        onBack={() => go("I2")} 
        onNext={() => {
          setGs(p => ({ ...p, capital: BASE_CAPITAL + MUD_TIERS[sel].topUp }));
          go("D1");
        }} 
        disabled={sel < 0} 
        nextLabel="Confirm Partnership" 
      />
    </div>
  );
};

const ScreenD1 = ({ gs, go, setGs }: ScreenProps) => {
  const storeIdx = gs.currentStoreIdx;
  const sel = gs.stores[storeIdx].location;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 relative flex flex-col">
      <BgIcon Icon={MapPin} />
      <div className="flex-1 max-w-6xl mx-auto w-full relative z-10">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">Location Strategy</h1>
            <p className="text-gray-500">Where will you open your store? Rent is deducted immediately.</p>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          <div className="w-full lg:w-1/2">
            <motion.div variants={STAGGER.container} initial="hidden" animate="show" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {LOCS.map(loc => (
                <motion.button
                  key={loc.id} variants={STAGGER.item}
                  onClick={() => setGs(p => {
                    const newStores = [...p.stores];
                    newStores[storeIdx].location = loc.id;
                    return { ...p, stores: newStores };
                  })}
                  className={`game-card text-left p-4 rounded-xl transition-all ${sel === loc.id ? 'border-primary bg-primary/5' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-bold text-gray-900">{loc.name}</h3>
                    {sel === loc.id && <CheckCircle size={18} className="text-primary" />}
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-3">{loc.tag}</p>
                  
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500 font-medium">Footfall</span>
                      <Stars n={loc.footfall} />
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500 font-medium">Competition</span>
                      <Stars n={loc.comp} />
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500 font-medium">Avg Basket</span>
                      <span className="font-bold">Rs {loc.basket}</span>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 rounded-lg p-2 text-center border border-gray-200">
                    <span className="text-[10px] text-gray-500 font-bold uppercase block mb-0.5">Monthly Rent</span>
                    <span className="font-bold text-gray-900">Rs {loc.cost.toLocaleString()}</span>
                  </div>
                </motion.button>
              ))}
            </motion.div>
          </div>

          <div className="w-full lg:w-1/2">
            <div className="game-card bg-white rounded-xl overflow-hidden">
              <div className="bg-gray-50 p-4 border-b border-gray-200">
                <h3 className="font-bold text-gray-900 text-sm">Consumer Demand Matrix</h3>
                <p className="text-xs text-gray-500">Research what people buy in each area.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-gray-50/50">
                      <th className="p-3 font-bold text-gray-600 border-b border-gray-200">Category</th>
                      {LOCS.map(l => (
                        <th key={l.id} className={`p-3 font-bold border-b border-gray-200 ${sel === l.id ? 'bg-primary/10 text-primary' : 'text-gray-600'}`}>
                          {l.name.split(' ')[0]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {CATS.map(cat => (
                      <tr key={cat.id} className="border-b border-gray-100 last:border-0">
                        <td className="p-3 flex items-center gap-2 font-medium">
                          <span>{cat.icon}</span> <span className="text-gray-700">{cat.name.split(' ')[0]}</span>
                        </td>
                        {LOCS.map(l => (
                          <td key={l.id} className={`p-3 ${sel === l.id ? 'bg-primary/5' : ''}`}>
                            <DemandBadge level={(l.demand as any)[cat.id]} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
      <BottomNav 
        onBack={() => {
          if (gs.reopening) {
            setGs(p => {
              const newStores = p.growChoice === "new_loc" ? p.stores.slice(0, -1) : p.stores;
              return { ...p, stores: newStores, checkpoint: p.checkpoint - 1, reopening: false };
            });
            go("D7");
          } else {
            go("D3");
          }
        }} 
        onNext={() => {
          setGs(p => {
            const newStores = [...p.stores];
            if (!newStores[storeIdx].id) {
              newStores[storeIdx].id = `${sel.substring(0,3).toUpperCase()}_${Math.floor(1000 + Math.random() * 9000)}`;
            }
            return { 
              ...p, 
              capital: p.capital - getLoc(sel).cost,
              stores: newStores
            };
          });
          go("D2");
        }} 
        disabled={!sel} 
        nextLabel="Pay Rent & Continue" 
      />
    </div>
  );
};

const ScreenD2 = ({ gs, go, setGs }: ScreenProps) => {
  const storeIdx = gs.currentStoreIdx;
  const sel = gs.stores[storeIdx].scale;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 relative flex flex-col">
      <BgIcon Icon={Building2} />
      <div className="flex-1 max-w-4xl mx-auto w-full relative z-10">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">Store Scale</h1>
            <p className="text-gray-500">How big will your store be? Larger stores hold more inventory.</p>
          </div>
        </div>

        <motion.div variants={STAGGER.container} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {SCALES.map(scale => {
            const canAfford = gs.capital >= scale.minCap;
            const isSel = sel === scale.id;
            return (
              <motion.button
                key={scale.id} variants={STAGGER.item}
                disabled={!canAfford}
                onClick={() => setGs(p => {
                  const newStores = [...p.stores];
                  newStores[storeIdx].scale = scale.id;
                  return { ...p, stores: newStores };
                })}
                className={`game-card text-left p-6 rounded-2xl transition-all relative overflow-hidden ${!canAfford ? 'opacity-50 bg-gray-50 border-gray-200 cursor-not-allowed' : isSel ? 'border-primary bg-primary/5' : 'border-gray-200 bg-white hover:border-gray-300'}`}
              >
                {!canAfford && (
                  <div className="absolute top-3 right-3 bg-red-100 text-red-600 text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider border border-red-200">
                    Need Rs {scale.minCap.toLocaleString()}
                  </div>
                )}
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 border-2 ${isSel ? 'bg-primary text-white border-pink-700' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                  <StoreTypeIcon scale={scale.id} size={24} />
                </div>
                <h3 className="font-bold text-gray-900 text-lg mb-2">{scale.name}</h3>
                <p className="text-sm text-gray-500 mb-6 h-10">{scale.desc}</p>
                
                <div className="space-y-3 border-t border-gray-200 pt-4">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500 font-medium">Footprint</span>
                    <span className="font-bold text-gray-900">{scale.fp}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500 font-medium">Inventory Slots</span>
                    <span className="font-bold text-primary">{scale.units} items</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500 font-medium">Est. Inv Cost</span>
                    <span className="font-bold text-gray-900">{scale.inv}</span>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </motion.div>

        <div className="game-card bg-blue-50 border-blue-200 rounded-xl p-4 flex gap-3">
          <Info className="text-blue-500 shrink-0" />
          <p className="text-sm text-blue-800"><strong>What's an inventory slot?</strong> Each slot allows you to stock one unique product type (e.g., "Atta 1kg"). You will automatically purchase {UNITS_PER_ITEM} units of each selected product.</p>
        </div>
      </div>
      <BottomNav 
        onBack={() => {
          if (gs.reopening && gs.growChoice === "scale_up") {
            setGs(p => ({ ...p, checkpoint: p.checkpoint - 1, reopening: false }));
            go("D7");
          } else {
            const locCost = getLoc(gs.stores[gs.currentStoreIdx].location).cost;
            setGs(p => ({ ...p, capital: p.capital + locCost }));
            go("D1");
          }
        }} 
        onNext={() => {
          setGs(p => {
            const newStores = [...p.stores];
            newStores[storeIdx].selectedItems = []; // Reset items when scale changes
            return { ...p, stores: newStores };
          });
          go("D4");
        }} 
        disabled={!sel} 
      />
    </div>
  );
};

const ScreenD4 = ({ gs, go, setGs }: ScreenProps) => {
  const [activeTab, setActiveTab] = useState(0);
  const store = gs.stores[activeTab];
  const limit = getScale(store.scale).units;
  const selected = store.selectedItems;
  const cost = calcInvCost(gs.stores);
  const remainingCap = gs.capital - cost;

  const toggleItem = (id: string) => {
    setGs(prev => {
      const newStores = [...prev.stores];
      const currentStore = { ...newStores[activeTab] };
      
      if (currentStore.selectedItems.includes(id)) {
        currentStore.selectedItems = currentStore.selectedItems.filter(x => x !== id);
      } else if (currentStore.selectedItems.length < limit) {
        currentStore.selectedItems = [...currentStore.selectedItems, id];
      }
      
      newStores[activeTab] = currentStore;
      return { ...prev, stores: newStores };
    });
  };

  const allStoresValid = gs.stores.every(s => s.selectedItems.length === getScale(s.scale).units);

  return (
    <div className="flex-1 flex flex-col h-full relative">
      <BgIcon Icon={Package} />
      <div className="sticky top-0 bg-white/90 backdrop-blur-md border-b-4 border-gray-200 p-4 md:p-6 z-20 flex flex-col md:flex-row justify-between items-start md:items-center shadow-sm gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-900">Inventory Selection</h1>
          <p className="text-sm text-gray-500 font-medium">Select items for each store based on local demand.</p>
        </div>
        <div className="flex items-center gap-4 md:gap-6 w-full md:w-auto justify-between md:justify-end">
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">Total Stock Cost</p>
            <p className="text-lg font-bold text-red-500">-Rs {cost.toLocaleString()}</p>
          </div>
          <div className="w-px h-8 bg-gray-300" />
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">Capital After Stock</p>
            <p className={`text-lg font-bold ${remainingCap < 0 ? 'text-red-500' : 'text-gray-900'}`}>Rs {remainingCap.toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 relative z-10 flex flex-col">
        <div className="flex-1 max-w-6xl mx-auto w-full space-y-8">
          
          {gs.stores.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {gs.stores.map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveTab(idx)}
                  className={`px-4 py-2 rounded-xl font-bold text-sm whitespace-nowrap transition-colors ${activeTab === idx ? 'bg-primary text-white' : 'bg-white text-gray-600 border-2 border-gray-200 hover:bg-gray-50'}`}
                >
                  {s.name || `Store ${idx + 1}`} ({s.selectedItems.length}/{getScale(s.scale).units})
                </button>
              ))}
            </div>
          )}

          <div className="game-card bg-blue-50 border-blue-200 rounded-xl p-4 flex items-center gap-3 mb-6">
            <TrendingUp className="text-blue-600 shrink-0" />
            <p className="text-sm text-blue-800 font-medium"><strong>Current Season: {getEventName(gs.checkpoint)}</strong>. Adjust your inventory to match the changing demand!</p>
          </div>

          {gs.reopening && Object.keys(store.stock).length > 0 && (
            <div className="game-card bg-emerald-50 border-emerald-200 rounded-xl p-4 flex items-center gap-3 mb-6">
              <Package className="text-emerald-600 shrink-0" />
              <p className="text-sm text-emerald-800 font-medium"><strong>Inventory Carry Forward:</strong> You still have unsold stock from previous rounds. Any new items selected here will be added to your existing stock.</p>
            </div>
          )}

          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900">Managing: {store.name || `Store ${activeTab + 1}`}</h2>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">Store Capacity</p>
              <p className="text-lg font-bold text-gray-900"><span className={selected.length === limit ? 'text-emerald-600' : 'text-primary'}>{selected.length}</span> / {limit}</p>
            </div>
          </div>

          {CATS.map(cat => {
            const items = ALL_ITEMS.filter(i => i.cat === cat.id).sort((a, b) => {
              const da = getAdjustedItemDemand(store.location, a, gs.checkpoint);
              const db = getAdjustedItemDemand(store.location, b, gs.checkpoint);
              const val = { High: 3, Medium: 2, Low: 1, None: 0 };
              return val[db as keyof typeof val] - val[da as keyof typeof val];
            });

            return (
              <div key={cat.id}>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-2xl">{cat.icon}</span>
                  <h2 className="text-lg font-bold text-gray-900">{cat.name}</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {items.map(item => {
                    const demand = getAdjustedItemDemand(store.location, item, gs.checkpoint);
                    const isSel = selected.includes(item.id);
                    const isDisabled = demand === "None" || (!isSel && selected.length >= limit);
                    const currentStock = store.stock[item.id] || 0;
                    
                    return (
                      <button
                        key={item.id}
                        disabled={isDisabled}
                        onClick={() => toggleItem(item.id)}
                        className={`game-card flex items-center p-3 rounded-xl text-left transition-all ${isSel ? 'border-primary bg-primary/5' : isDisabled ? 'border-gray-200 bg-gray-100 opacity-60 cursor-not-allowed' : 'border-gray-300 bg-white hover:border-gray-400'}`}
                      >
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center mr-3 shrink-0 ${isSel ? 'bg-primary border-primary text-white' : 'border-gray-300 bg-white'}`}>
                          {isSel && <CheckCircle size={14} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm text-gray-900 truncate">{item.name}</p>
                          <div className="flex items-center justify-between mt-1">
                            <DemandBadge level={demand} />
                            <div className="flex items-center gap-2">
                              {currentStock > 0 && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200">In Stock: {currentStock}</span>}
                              {isSel && <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">+{UNITS_PER_ITEM} units · Rs {(item.cost * UNITS_PER_ITEM).toLocaleString()}</span>}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <BottomNav 
          onBack={() => {
            if (gs.reopening && gs.growChoice === "hold") {
              setGs(p => ({ ...p, checkpoint: p.checkpoint - 1, reopening: false }));
              go("D7");
            } else {
              go("D2");
            }
          }} 
          onNext={() => {
            setGs(p => ({ ...p, capital: p.capital - cost }));
            go("P1");
          }} 
          disabled={!allStoresValid || remainingCap < 0} 
          nextLabel="Purchase Stock" 
        />
      </div>
    </div>
  );
};

const ScreenP1 = ({ gs, go, setGs }: ScreenProps) => {
  const [activeTab, setActiveTab] = useState(0);
  const store = gs.stores[activeTab];
  const filledCats = Array.from(new Set(store.selectedItems.map(id => getItem(id).cat)));
  const isMidGame = gs.cpHistory.length > 0;
  const weakest = isMidGame ? getWeakestPillar(gs.cpHistory) : null;

  const setPrice = (cat: string, tier: "value"|"standard"|"premium") => {
    setGs(p => {
      const newStores = [...p.stores];
      newStores[activeTab].prices = { ...newStores[activeTab].prices, [cat]: tier };
      return { ...p, stores: newStores };
    });
  };

  const setAllPrices = (tier: "value"|"standard"|"premium") => {
    setGs(p => {
      const newStores = [...p.stores];
      const newPrices = { ...newStores[activeTab].prices };
      filledCats.forEach(cat => {
        newPrices[cat] = tier;
      });
      newStores[activeTab].prices = newPrices;
      return { ...p, stores: newStores };
    });
  };

  const getPricingTip = () => {
    if (store.scale === 'dept' && (store.location === 'clifton' || store.location === 'gulshan')) return "As a Departmental Store in a wealthier area, customers expect premium quality and are willing to pay Premium prices.";
    if (store.scale === 'counter' && store.location === 'korangi') return "As a small Kiryana in a working-class area, Value pricing is essential to keep your customers.";
    return "Standard pricing is a safe bet, but adjust based on your specific category demands.";
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 relative flex flex-col">
      <BgIcon Icon={Tag} />
      <div className="flex-1 max-w-5xl mx-auto w-full relative z-10">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">Pricing Strategy</h1>
            <p className="text-gray-500">Set prices for your stocked categories. Match your target market.</p>
          </div>
        </div>

        {gs.stores.length > 1 && (
          <div className="flex gap-2 overflow-x-auto mb-6 pb-2">
            {gs.stores.map((s, idx) => (
              <button
                key={idx}
                onClick={() => setActiveTab(idx)}
                className={`px-4 py-2 rounded-xl font-bold text-sm whitespace-nowrap transition-colors ${activeTab === idx ? 'bg-primary text-white' : 'bg-white text-gray-600 border-2 border-gray-200 hover:bg-gray-50'}`}
              >
                {s.name || `Store ${idx + 1}`}
              </button>
            ))}
          </div>
        )}

        <div className="game-card bg-blue-50 border-blue-200 rounded-xl p-4 mb-8 flex gap-3">
          <Info className="text-blue-500 shrink-0" />
          <div>
            <h4 className="font-bold text-blue-900 text-sm mb-1">Market Analysis ({store.name})</h4>
            <p className="text-sm text-blue-800 font-medium">{getPricingTip()}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {PRICE_TIERS.map(tier => (
            <button 
              key={tier.id} 
              onClick={() => setAllPrices(tier.id as any)}
              className="game-card bg-white rounded-xl p-4 text-center hover:bg-gray-50 transition-colors flex flex-col items-center"
            >
              <h3 className="font-bold text-gray-900 mb-1">{tier.label}</h3>
              <p className="text-sm font-bold text-primary mb-2">Markup: ×{tier.mult}</p>
              <p className="text-xs text-gray-500 font-medium mb-3">
                {tier.id === "value" && "Attracts budget shoppers, lower margin."}
                {tier.id === "standard" && "Balanced approach for average areas."}
                {tier.id === "premium" && "High margin, requires wealthy clientele."}
              </p>
              <div className="mt-auto text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-3 py-1.5 rounded-lg border border-primary/20 w-full">
                Set All to {tier.label}
              </div>
            </button>
          ))}
        </div>

        {isMidGame && weakest && (
          <div className="game-card bg-amber-50 border-amber-200 rounded-xl p-4 mb-8 flex gap-3">
            <TrendingUp className="text-amber-500 shrink-0" />
            <div>
              <h4 className="font-bold text-amber-800 text-sm mb-1">Scorecard Hint</h4>
              <p className="text-sm text-amber-700 font-medium">
                Your weakest pillar is <strong>{weakest}</strong>. 
                {weakest === "customer" && " Try lowering prices (Value) on essentials to boost satisfaction."}
                {weakest === "financial" && " Try raising prices (Premium) on less price-sensitive items to boost margins."}
                {weakest === "internal" && " Pricing has less direct impact here, focus on fulfillment."}
              </p>
            </div>
          </div>
        )}

        <div className="game-card bg-white rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[500px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="p-4 font-bold text-gray-600">Category</th>
                  <th className="p-4 font-bold text-gray-600 text-center">Value</th>
                  <th className="p-4 font-bold text-gray-600 text-center">Standard</th>
                  <th className="p-4 font-bold text-gray-600 text-center">Premium</th>
                </tr>
              </thead>
              <tbody>
                {filledCats.map(catId => {
                  const cat = getCat(catId);
                  const current = store.prices[catId];
                  return (
                    <tr key={catId} className="border-b border-gray-100 last:border-0">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{cat.icon}</span>
                          <div>
                            <p className="font-bold text-gray-900">{cat.name}</p>
                            <p className="text-xs text-gray-500 font-medium">{store.selectedItems.filter(id => getItem(id).cat === catId).length} items stocked</p>
                          </div>
                        </div>
                      </td>
                      {PRICE_TIERS.map(tier => (
                        <td key={tier.id} className="p-4 text-center">
                          <button
                            onClick={() => setPrice(catId, tier.id as any)}
                            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center mx-auto transition-all ${current === tier.id ? 'border-primary bg-primary' : 'border-gray-300 bg-white hover:border-primary/50'}`}
                          >
                            {current === tier.id && <div className="w-2 h-2 bg-white rounded-full" />}
                          </button>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <BottomNav 
        onBack={() => {
          const cost = calcInvCost(gs.stores);
          setGs(p => ({ ...p, capital: p.capital + cost }));
          go("D4");
        }} 
        onNext={() => go("D5")} 
        secondaryLabel={isMidGame ? "Keep Prices As-Is" : undefined}
        onSecondary={isMidGame ? () => go("D5") : undefined}
      />
    </div>
  );
};

const ScreenD5 = ({ gs, go, setGs }: ScreenProps) => {
  const sel = gs.promotionChoice;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 relative flex flex-col">
      <BgIcon Icon={Megaphone} />
      <div className="flex-1 max-w-5xl mx-auto w-full relative z-10">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">Promotion Plan</h1>
            <p className="text-gray-500">How will you attract customers? Cost is deducted when store opens.</p>
          </div>
        </div>

        <motion.div variants={STAGGER.container} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {PROMOTION_OPTIONS.map(opt => {
            const isSel = sel === opt.id;
            return (
              <motion.button
                key={opt.id} variants={STAGGER.item}
                onClick={() => setGs(p => ({ ...p, promotionChoice: opt.id }))}
                className={`game-card text-left p-6 rounded-2xl transition-all flex flex-col h-full ${isSel ? 'border-primary bg-primary/5' : 'border-gray-200 bg-white hover:border-gray-300'}`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gray-100 border-2 border-gray-200 flex items-center justify-center text-2xl">{opt.icon}</div>
                  {isSel && <CheckCircle size={24} className="text-primary" />}
                </div>
                <h3 className="font-bold text-gray-900 text-lg">{opt.label}</h3>
                <p className="text-xs text-gray-400 font-display mb-3">{opt.urdu}</p>
                <p className="text-sm text-gray-600 mb-4 flex-1 font-medium">{opt.desc}</p>
                
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 w-full mb-4">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2">Scorecard Impact</p>
                  <div className="space-y-1.5 text-xs font-medium">
                    <div className="flex justify-between"><span className="text-gray-600">Customer Reach</span><span className={opt.bsc.customer > 0 ? 'text-emerald-600 font-bold' : 'text-gray-400'}>+{opt.bsc.customer}</span></div>
                    <div className="flex justify-between"><span className="text-gray-600">Financial Impact</span><span className={opt.bsc.financial < 0 ? 'text-red-500 font-bold' : opt.bsc.financial > 0 ? 'text-emerald-600 font-bold' : 'text-gray-400'}>{opt.bsc.financial > 0 ? '+' : ''}{opt.bsc.financial}</span></div>
                  </div>
                </div>

                <div className={`w-full py-2 rounded-lg text-center font-bold text-sm border-2 ${opt.cost === 0 ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-900 border-gray-200'}`}>
                  {opt.cost === 0 ? 'Free' : `Rs ${opt.cost.toLocaleString()}`}
                </div>
              </motion.button>
            );
          })}
        </motion.div>

        <AnimatePresence>
          {sel && PROMOTION_OPTIONS.find(p=>p.id===sel)?.cost! > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="game-card bg-amber-50 border-amber-200 rounded-xl p-4 flex items-center gap-3 max-w-md mx-auto">
              <AlertTriangle className="text-amber-500 shrink-0" />
              <p className="text-sm text-amber-800 font-bold">Rs {PROMOTION_OPTIONS.find(p=>p.id===sel)?.cost.toLocaleString()} will be deducted when the store opens.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <BottomNav 
        onBack={() => go("P1")} 
        onNext={() => {
          if (gs.reopening) {
            const promoCost = PROMOTION_OPTIONS.find(p=>p.id===sel)?.cost || 0;
            const setupPoints = computeSetupPoints(gs.stores, gs.mudarabah, sel);
            const requests = generateRequests(gs.stores, gs.checkpoint);
            
            // Carry forward inventory logic
            const newStores = [...gs.stores];
            newStores.forEach(store => {
              store.selectedItems.forEach(id => {
                store.stock[id] = (store.stock[id] || 0) + UNITS_PER_ITEM;
              });
            });

            setGs(p => ({ ...p, setupPoints, capital: p.capital - promoCost, requests, stores: newStores, screen: "G1", reqIdx: 0, results: [], reopening: false }));
          } else {
            go("D6");
          }
        }} 
        disabled={!sel} 
      />
    </div>
  );
};

const ScreenD6 = ({ gs, go, setGs }: ScreenProps) => {
  const promoCost = PROMOTION_OPTIONS.find(p=>p.id===gs.promotionChoice)?.cost || 0;

  const handleOpen = () => {
    const setupPoints = computeSetupPoints(gs.stores, gs.mudarabah, gs.promotionChoice);
    
    // Initial stock setup
    const newStores = [...gs.stores];
    newStores.forEach(store => {
      store.selectedItems.forEach(id => {
        store.stock[id] = (store.stock[id] || 0) + UNITS_PER_ITEM;
      });
    });

    setGs(p => ({ ...p, setupPoints, capital: p.capital - promoCost, stores: newStores }));
    go("G1"); // goWithG1 is passed as go in App.tsx
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 relative flex flex-col">
      <BgIcon Icon={CheckCircle} />
      <div className="flex-1 max-w-5xl mx-auto w-full relative z-10">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">Store Opening Summary</h1>
            <p className="text-gray-500">Review your setup before opening the doors.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          <MetricTile label="Owner" value={gs.playerName} sub={`${gs.stores.length} Store(s)`} />
          <MetricTile label="Partner" value={MUD_TIERS[Math.max(0, gs.mudarabah)].name} sub={`Share: ${MUD_TIERS[Math.max(0, gs.mudarabah)].share}`} />
          <MetricTile label="Promotion" value={PROMOTION_OPTIONS.find(p=>p.id===gs.promotionChoice)?.label} sub={`Cost: Rs ${promoCost.toLocaleString()}`} />
          <MetricTile label="Capital Remaining" value={`Rs ${(gs.capital - promoCost).toLocaleString()}`} accent />
        </div>

        {gs.stores.map((store, idx) => (
          <div key={idx} className="game-card bg-white rounded-xl p-6 mb-8">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-bold text-gray-900 text-lg">{store.name}</h3>
                <p className="text-sm text-gray-500">{getLoc(store.location).name} • {getScale(store.scale).name}</p>
              </div>
              <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-bold rounded-lg border border-gray-200">Store ID: {store.id}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b-2 border-gray-200">
                    <th className="p-3 font-bold text-gray-600">Item</th>
                    <th className="p-3 font-bold text-gray-600">Category</th>
                    <th className="p-3 font-bold text-gray-600 text-center">Qty</th>
                    <th className="p-3 font-bold text-gray-600 text-right">Unit Cost</th>
                    <th className="p-3 font-bold text-gray-600 text-right">Total Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {store.selectedItems.map(id => {
                    const item = getItem(id);
                    const total = item.cost * UNITS_PER_ITEM;
                    return (
                      <tr key={id} className="border-b border-gray-100">
                        <td className="p-3 font-medium text-gray-900">{item.name}</td>
                        <td className="p-3 text-gray-500 flex items-center gap-1"><span>{getCat(item.cat).icon}</span> {getCat(item.cat).name.split(' ')[0]}</td>
                        <td className="p-3 text-center font-bold text-primary">{UNITS_PER_ITEM}</td>
                        <td className="p-3 text-right text-gray-600">Rs {item.cost.toLocaleString()}</td>
                        <td className="p-3 text-right font-bold text-gray-900">Rs {total.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-gray-50 font-bold">
                    <td colSpan={4} className="p-3 text-right text-gray-900">Store Inventory Cost:</td>
                    <td className="p-3 text-right text-red-600">Rs {store.selectedItems.reduce((sum, id) => sum + (getItem(id).cost * UNITS_PER_ITEM), 0).toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="game-card bg-blue-50 border-blue-200 rounded-xl p-5">
            <h4 className="font-bold text-blue-900 mb-2 flex items-center gap-2"><BarChart2 size={18} /> Profit & Loss</h4>
            <p className="text-sm text-blue-800 leading-relaxed font-medium">Your revenue will depend on fulfilling customer requests. Rent and inventory costs are already paid. Promotion cost will be deducted now. Your partner takes their cut from the gross profit.</p>
          </div>
          <div className="game-card bg-emerald-50 border-emerald-200 rounded-xl p-5">
            <h4 className="font-bold text-emerald-900 mb-2 flex items-center gap-2"><Clock size={18} /> The Checkpoint</h4>
            <p className="text-sm text-emerald-800 leading-relaxed font-medium">You have 60 seconds to serve 12 customers. If you don't have what they want, you must miss the delivery. Speed and accuracy matter!</p>
          </div>
        </div>
      </div>
      <BottomNav onBack={() => go("D5")} onNext={handleOpen} nextLabel="Start Checkpoint 1" />
    </div>
  );
};

const ScreenG1 = ({ gs, go, setGs }: ScreenProps) => {
  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-white/50 relative flex flex-col">
      <BgIcon Icon={ShoppingCart} />
      <div className="flex-1 max-w-5xl mx-auto w-full relative z-10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="px-3 py-1 bg-primary text-white text-xs font-bold uppercase tracking-wider rounded-full shadow-sm">Checkpoint {gs.checkpoint}</span>
              <span className="text-gray-600 font-bold text-sm flex items-center gap-1"><MapPin size={14} /> {gs.stores.length} Store(s) Active</span>
            </div>
            <h1 className="text-3xl font-display font-bold text-gray-900">Customer Requests</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="game-card flex items-center gap-2 bg-white px-4 py-2 rounded-xl">
              <Clock className="text-primary" size={20} />
              <span className="font-bold text-gray-900">60s per delivery</span>
            </div>
          </div>
        </div>

        <SectionLabel>Incoming Orders (12)</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {gs.requests.map((req, i) => {
            const store = gs.stores[req.storeIdx];
            const inStock = store.stock[req.id] > 0;
            return (
              <div key={i} className="game-card bg-white rounded-xl p-4 relative overflow-hidden">
                {!inStock && <div className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg uppercase tracking-wider">No Stock</div>}
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-6 h-6 rounded-full bg-gray-100 border border-gray-200 text-gray-600 flex items-center justify-center text-xs font-bold shrink-0">{i+1}</div>
                  <div>
                    <p className="font-bold text-gray-900 text-sm leading-tight">{req.name}</p>
                    <p className="text-xs text-gray-500 font-medium flex items-center gap-1 mt-0.5"><span>{getCat(req.cat).icon}</span> {getCat(req.cat).name.split(' ')[0]}</p>
                  </div>
                </div>
                <p className="text-sm text-gray-600 italic bg-gray-50 p-2 rounded-lg border border-gray-200 font-medium mb-2">"{req.flavorText}"</p>
                <div className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-1 rounded inline-block">
                  📍 {store.name}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <BottomNav onNext={() => go("G2")} nextLabel="Begin Deliveries" />
    </div>
  );
};

const ScreenG2 = ({ gs, go, setGs }: ScreenProps) => {
  const [timeLeft, setTimeLeft] = useState(60);
  const firedRef = useRef(false);
  const currentReq = gs.requests[gs.reqIdx];
  const store = gs.stores[currentReq.storeIdx];
  const inStock = store.stock[currentReq.id] > 0;

  const advance = useCallback((outcome: "fulfilled" | "missed", voluntary: boolean) => {
    if (firedRef.current) return;
    firedRef.current = true;

    setGs(prev => {
      const isLast = prev.reqIdx === prev.requests.length - 1;
      const newStores = [...prev.stores];
      const currentStore = { ...newStores[currentReq.storeIdx] };
      const nextStock = { ...currentStore.stock };

      if (outcome === "fulfilled") {
        nextStock[currentReq.id] = Math.max(0, (nextStock[currentReq.id] || 0) - 1);
        currentStore.stock = nextStock;
        newStores[currentReq.storeIdx] = currentStore;
      }

      const nextResults = [...prev.results, outcome];

      if (isLast) {
        const promoCost = PROMOTION_OPTIONS.find(p => p.id === prev.promotionChoice)?.cost || 0;
        const cp = mkCPResult(prev.checkpoint, nextResults, prev.requests, newStores, prev.mudarabah, prev.setupPoints, promoCost);
        return { ...prev, stores: newStores, results: nextResults, cpHistory: [...prev.cpHistory, cp], capital: prev.capital + (cp.revenue - cp.mudCut), screen: "G4" };
      }

      return { ...prev, stores: newStores, results: nextResults, reqIdx: prev.reqIdx + 1 };
    });
  }, [currentReq.id, currentReq.storeIdx, setGs]);

  useEffect(() => {
    setTimeLeft(60);
    firedRef.current = false;
    
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          advance("missed", false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, [gs.reqIdx, advance]);

  useEnterKey(() => {
    if (inStock) advance("fulfilled", false);
    else advance("missed", true);
  }, false);

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - timeLeft / 60);
  const timerColor = timeLeft > 30 ? '#10B981' : timeLeft > 10 ? '#F59E0B' : '#EF4444';

  // Display all items that are either selected this round OR have stock remaining for THIS store
  const displayItems = Array.from(new Set([...store.selectedItems, ...Object.keys(store.stock).filter(id => store.stock[id] > 0)]));

  return (
    <div className="flex flex-col md:flex-row h-full w-full bg-white overflow-y-auto md:overflow-hidden relative">
      <BgIcon Icon={Clock} />
      {/* LEFT PANEL */}
      <div className="w-full md:w-1/2 p-4 md:p-8 flex flex-col border-b-4 md:border-b-0 md:border-r-4 border-gray-200 bg-gray-50/80 relative z-10">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="font-display font-bold text-xl text-gray-900">Deliveries</h2>
            <p className="text-sm text-gray-500 font-bold">Checkpoint {gs.checkpoint} • Request {gs.reqIdx + 1}/12</p>
          </div>
          <div className="flex gap-3 text-sm font-bold">
            <div className="game-card bg-emerald-50 text-emerald-700 px-3 py-1 rounded-lg border-emerald-200">{gs.results.filter(r=>r==="fulfilled").length} ✓</div>
            <div className="game-card bg-red-50 text-red-700 px-3 py-1 rounded-lg border-red-200">{gs.results.filter(r=>r==="missed").length} ✗</div>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="relative w-40 h-40 mb-8">
            <svg className="w-full h-full transform -rotate-90">
              <circle cx="80" cy="80" r={radius} stroke="#E5E7EB" strokeWidth="8" fill="none" />
              <circle cx="80" cy="80" r={radius} stroke={timerColor} strokeWidth="8" fill="none" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} className="transition-all duration-1000 ease-linear" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center flex-col">
              <span className="text-4xl font-display font-bold text-gray-900">{timeLeft}</span>
              <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Seconds</span>
            </div>
          </div>

          <motion.div key={gs.reqIdx} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="game-card w-full max-w-md bg-white rounded-2xl border-primary p-8 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-primary" />
            <div className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-1 rounded">
              📍 {store.name}
            </div>
            <span className="text-5xl block mb-4 mt-4">{getCat(currentReq.cat).icon}</span>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">{currentReq.name}</h3>
            <p className="text-sm text-primary font-bold uppercase tracking-wider mb-6">{getCat(currentReq.cat).name}</p>
            <p className="text-lg text-gray-600 italic bg-gray-50 p-4 rounded-xl border border-gray-200 font-medium">"{currentReq.flavorText}"</p>
          </motion.div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="w-full md:w-1/2 p-4 md:p-8 flex flex-col bg-white/90 relative z-10">
        <div className="flex justify-between items-end mb-6">
          <h3 className="font-bold text-gray-900 text-lg">Inventory: {store.name}</h3>
          <span className="text-sm text-gray-500 font-bold">Click to deliver</span>
        </div>

        <div className="flex-1 overflow-y-auto dark-scroll pr-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {displayItems.map(id => {
              const item = getItem(id);
              const count = store.stock[id] || 0;
              const isReq = id === currentReq.id;
              
              return (
                <div key={id} className={`game-card p-3 rounded-xl transition-all relative ${isReq ? (count > 0 ? 'border-emerald-500 bg-emerald-50' : 'border-red-500 bg-red-50') : 'border-gray-200 bg-white opacity-70'}`}>
                  {isReq && <div className={`absolute -top-3 -right-3 w-8 h-8 rounded-full flex items-center justify-center text-white shadow-md border-2 border-white ${count > 0 ? 'bg-emerald-500' : 'bg-red-500'}`}><AlertTriangle size={14} /></div>}
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xl">{getCat(item.cat).icon}</span>
                    <span className={`font-bold text-xl ${count > 0 ? 'text-gray-900' : 'text-red-500'}`}>{count}</span>
                  </div>
                  <p className="text-xs font-bold text-gray-700 leading-tight">{item.name}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-6 pt-6 border-t-4 border-gray-100">
          {!inStock && (
            <div className="game-card bg-red-50 border-red-200 rounded-xl p-4 mb-4 flex items-center gap-3">
              <XCircle className="text-red-500 shrink-0" />
              <p className="text-sm text-red-800 font-bold">Out of stock! You must miss this delivery.</p>
            </div>
          )}
          
          <div className="flex flex-col sm:flex-row gap-4">
            {inStock ? (
              <>
                <button onClick={() => advance("missed", true)} className="game-card flex-1 py-4 rounded-xl font-bold text-gray-600 bg-white border-gray-300 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2">
                  <XCircle size={20} /> Skip Request
                </button>
                <button onClick={() => advance("fulfilled", false)} className="game-card flex-[2] py-4 rounded-xl font-bold text-white bg-emerald-500 border-emerald-600 hover:bg-emerald-600 transition-all flex items-center justify-center gap-2 text-lg">
                  <CheckCircle size={24} /> Deliver!
                </button>
              </>
            ) : (
              <button onClick={() => advance("missed", true)} className="game-card w-full py-4 rounded-xl font-bold text-white bg-red-500 border-red-600 hover:bg-red-600 transition-all flex items-center justify-center gap-2 text-lg">
                <XCircle size={24} /> Miss Delivery
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const ScreenG4 = ({ gs, go, setGs }: ScreenProps) => {
  const cp = gs.cpHistory[gs.cpHistory.length - 1];
  const rate = Math.round((cp.fulfilled / 12) * 100);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 relative flex flex-col">
      <BgIcon Icon={BarChart2} />
      <div className="flex-1 max-w-5xl mx-auto w-full relative z-10">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">Checkpoint {cp.cp} Complete</h1>
            <p className="text-gray-500 font-medium">Here are your financial results for this round.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
          <MetricTile label="Fulfilled" value={`${cp.fulfilled}/12`} sub={`${rate}% Success Rate`} />
          <MetricTile label="Revenue" value={`Rs ${cp.revenue.toLocaleString()}`} />
          <MetricTile label="Costs" value={`Rs ${(cp.rent + cp.invCost + cp.promoCost).toLocaleString()}`} sub="Rent + Stock + Promo" />
          <MetricTile label="Net Profit" value={`Rs ${cp.profit.toLocaleString()}`} accent={cp.profit > 0} />
          <MetricTile label="Capital in Hand" value={<AnimatedNumber value={gs.capital} prefix="Rs " />} accent />
        </div>

        <div className="game-card bg-white rounded-xl p-6">
          <h3 className="font-bold text-gray-900 mb-4">Delivery Log</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {gs.requests.map((req, i) => {
              const res = gs.results[i];
              return (
                <div key={i} className={`flex items-center gap-3 p-3 rounded-lg border-2 ${res === "fulfilled" ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                  {res === "fulfilled" ? <CheckCircle size={18} className="text-emerald-500 shrink-0" /> : <XCircle size={18} className="text-red-500 shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-gray-900 truncate">{req.name}</p>
                    <p className="text-[10px] text-gray-500 font-bold flex items-center gap-1"><span>{getCat(req.cat).icon}</span> {getCat(req.cat).name.split(' ')[0]}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <BottomNav onNext={() => gs.checkpoint < 5 ? go("BSC") : go("BSC_FINAL")} nextLabel="View Scorecard" />
    </div>
  );
};

const ScreenBSC = ({ gs, go, setGs }: ScreenProps) => {
  const cp = gs.cpHistory[gs.cpHistory.length - 1];
  const weakest = getWeakestPillar(gs.cpHistory);
  
  const getAvg = (pillar: "financial"|"customer"|"internal") => {
    const sum = gs.cpHistory.reduce((acc, curr) => acc + curr.pillarScores[pillar], 0);
    return Math.round(sum / gs.cpHistory.length);
  };

  const [showInsights, setShowInsights] = useState(false);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 relative flex flex-col">
      <BgIcon Icon={TrendingUp} />
      <div className="flex-1 max-w-6xl mx-auto w-full relative z-10">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">Balanced Scorecard</h1>
            <p className="text-gray-500 font-medium">Performance across three key pillars after Checkpoint {cp.cp}.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* CUSTOMER */}
          <div className="game-card bg-white rounded-2xl p-6 relative overflow-hidden">
            {weakest === "customer" && <div className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">Weakest</div>}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center border border-blue-200"><Users size={20} /></div>
              <h2 className="font-bold text-gray-900 text-lg">Customer</h2>
            </div>
            <div className="space-y-4 mb-6 font-medium">
              <div className="flex justify-between items-center"><span className="text-sm text-gray-500">Fulfillment Rate</span><span className="font-bold">{Math.round((cp.fulfilled/12)*100)}%</span></div>
              <div className="flex justify-between items-center"><span className="text-sm text-gray-500">Recognition</span><span className="font-bold">{cp.recognition}/100</span></div>
              <div className="flex justify-between items-center"><span className="text-sm text-gray-500">Delivered</span><span className="font-bold text-emerald-600">{cp.fulfilled}</span></div>
              <div className="flex justify-between items-center"><span className="text-sm text-gray-500">Missed</span><span className="font-bold text-red-500">{cp.missed}</span></div>
            </div>
            <div className="pt-4 border-t-2 border-gray-100">
              <div className="flex justify-between items-end mb-2">
                <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Pillar Score</span>
                <span className="text-2xl font-bold text-blue-600">{cp.pillarScores.customer}</span>
              </div>
              <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden mb-1 border border-gray-200"><div className="h-full bg-blue-500" style={{width: `${cp.pillarScores.customer}%`}}/></div>
              <p className="text-[10px] text-gray-400 font-bold text-right">Avg: {getAvg("customer")}</p>
            </div>
          </div>

          {/* FINANCIAL */}
          <div className="game-card bg-white rounded-2xl p-6 relative overflow-hidden">
            {weakest === "financial" && <div className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">Weakest</div>}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center border border-emerald-200"><DollarSign size={20} /></div>
              <h2 className="font-bold text-gray-900 text-lg">Financial</h2>
            </div>
            <div className="space-y-4 mb-6 font-medium">
              <div className="flex justify-between items-center"><span className="text-sm text-gray-500">Revenue</span><span className="font-bold">Rs {cp.revenue.toLocaleString()}</span></div>
              <div className="flex justify-between items-center"><span className="text-sm text-gray-500">Rent</span><span className="font-bold text-red-500">-Rs {cp.rent.toLocaleString()}</span></div>
              <div className="flex justify-between items-center"><span className="text-sm text-gray-500">Stock Cost</span><span className="font-bold text-red-500">-Rs {cp.invCost.toLocaleString()}</span></div>
              <div className="flex justify-between items-center"><span className="text-sm text-gray-500">Net Profit</span><span className={`font-bold ${cp.profit>0?'text-emerald-600':'text-red-500'}`}>Rs {cp.profit.toLocaleString()}</span></div>
            </div>
            <div className="pt-4 border-t-2 border-gray-100">
              <div className="flex justify-between items-end mb-2">
                <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Pillar Score</span>
                <span className="text-2xl font-bold text-emerald-600">{cp.pillarScores.financial}</span>
              </div>
              <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden mb-1 border border-gray-200"><div className="h-full bg-emerald-500" style={{width: `${cp.pillarScores.financial}%`}}/></div>
              <p className="text-[10px] text-gray-400 font-bold text-right">Avg: {getAvg("financial")}</p>
            </div>
          </div>

          {/* INTERNAL */}
          <div className="game-card bg-white rounded-2xl p-6 relative overflow-hidden">
            {weakest === "internal" && <div className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">Weakest</div>}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center border border-purple-200"><TrendingUp size={20} /></div>
              <h2 className="font-bold text-gray-900 text-lg">Internal Process</h2>
            </div>
            <div className="space-y-4 mb-6 font-medium">
              <div className="flex justify-between items-center"><span className="text-sm text-gray-500">Satisfaction</span><span className="font-bold">{cp.satisfaction}/100</span></div>
              <div className="flex justify-between items-center"><span className="text-sm text-gray-500">Expansion Ready</span><span className={`font-bold ${cp.recognition>=70?'text-emerald-600':'text-gray-400'}`}>{cp.recognition>=70?'Yes':'No'}</span></div>
              <div className="flex justify-between items-center"><span className="text-sm text-gray-500">Checkpoint</span><span className="font-bold">{cp.cp}/5</span></div>
              <div className="flex justify-between items-center"><span className="text-sm text-gray-500">Stores</span><span className="font-bold">{gs.stores.length}</span></div>
            </div>
            <div className="pt-4 border-t-2 border-gray-100">
              <div className="flex justify-between items-end mb-2">
                <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Pillar Score</span>
                <span className="text-2xl font-bold text-purple-600">{cp.pillarScores.internal}</span>
              </div>
              <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden mb-1 border border-gray-200"><div className="h-full bg-purple-500" style={{width: `${cp.pillarScores.internal}%`}}/></div>
              <p className="text-[10px] text-gray-400 font-bold text-right">Avg: {getAvg("internal")}</p>
            </div>
          </div>
        </div>

        <div className="game-card bg-white rounded-xl overflow-hidden">
          <button onClick={() => setShowInsights(!showInsights)} className="w-full p-4 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors">
            <div className="flex items-center gap-2 font-bold text-gray-900"><BarChart2 size={18} className="text-primary" /> Store Insights (4Ps)</div>
            {showInsights ? <ChevronUp size={20} className="text-gray-500" /> : <ChevronDown size={20} className="text-gray-500" />}
          </button>
          <AnimatePresence>
            {showInsights && (
              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 border-t-2 border-gray-200">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Product</h4>
                    <p className="text-sm text-gray-700 font-medium">You have {gs.stores.length} store(s) active. Ensure your product mix matches local demand.</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Price</h4>
                    <p className="text-sm text-gray-700 font-medium">Your pricing strategy is currently active. Check if it matches the market.</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Place</h4>
                    <p className="text-sm text-gray-700 font-medium">You are operating in {gs.stores.map(s => getLoc(s.location).name).join(', ')}.</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Promotion</h4>
                    <p className="text-sm text-gray-700 font-medium">You chose {PROMOTION_OPTIONS.find(p=>p.id===gs.promotionChoice)?.label}.</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <BottomNav onNext={() => go("D7")} nextLabel="Growth Strategy" />
    </div>
  );
};

const ScreenBSCFinal = ({ gs, go, setGs }: ScreenProps) => {
  const getAvg = (pillar: "financial"|"customer"|"internal") => {
    const sum = gs.cpHistory.reduce((acc, curr) => acc + curr.pillarScores[pillar], 0);
    return Math.round(sum / gs.cpHistory.length);
  };

  const avgF = getAvg("financial");
  const avgC = getAvg("customer");
  const avgI = getAvg("internal");
  const composite = Math.round((avgF + avgC + avgI) / 3);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 relative flex flex-col">
      <BgIcon Icon={Trophy} />
      <div className="flex-1 max-w-6xl mx-auto w-full relative z-10">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-display font-bold text-gray-900 mb-3">Final Scorecard Analysis</h1>
          <p className="text-gray-500 max-w-2xl mx-auto font-medium">How your decisions translated into performance across the year.</p>
        </div>

        <div className="game-card bg-gradient-to-r from-primary to-pink-600 rounded-2xl p-8 text-white mb-10 flex flex-col md:flex-row items-center justify-between border-pink-700 gap-6">
          <div className="text-center md:text-left">
            <p className="text-sm font-bold uppercase tracking-widest text-white/80 mb-1">Composite Score</p>
            <div className="text-6xl font-display font-bold">{composite}<span className="text-3xl text-white/60">/100</span></div>
          </div>
          <div className="flex gap-6">
            <div className="text-center"><p className="text-xs text-white/70 font-bold uppercase tracking-wider mb-1">Financial</p><p className="text-2xl font-bold">{avgF}</p></div>
            <div className="text-center"><p className="text-xs text-white/70 font-bold uppercase tracking-wider mb-1">Customer</p><p className="text-2xl font-bold">{avgC}</p></div>
            <div className="text-center"><p className="text-xs text-white/70 font-bold uppercase tracking-wider mb-1">Internal</p><p className="text-2xl font-bold">{avgI}</p></div>
          </div>
        </div>

        <div className="space-y-8">
          <div className="game-card bg-white rounded-xl overflow-hidden">
            <div className="bg-gray-50 p-4 border-b-2 border-gray-200">
              <h3 className="font-bold text-gray-900">Step 1: Setup Contributions</h3>
              <p className="text-xs text-gray-500 font-medium">Points earned from your initial strategy.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[500px]">
                <thead>
                  <tr className="bg-gray-50/50 border-b-2 border-gray-200">
                    <th className="p-3 font-bold text-gray-600">Decision</th>
                    <th className="p-3 font-bold text-gray-600 text-center">Financial</th>
                    <th className="p-3 font-bold text-gray-600 text-center">Customer</th>
                    <th className="p-3 font-bold text-gray-600 text-center">Internal</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
                    <td className="p-3 text-right">Setup Total</td>
                    <td className="p-3 text-center text-primary">{gs.setupPoints.financial}</td>
                    <td className="p-3 text-center text-primary">{gs.setupPoints.customer}</td>
                    <td className="p-3 text-center text-primary">{gs.setupPoints.internal}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="game-card bg-white rounded-xl overflow-hidden">
            <div className="bg-gray-50 p-4 border-b-2 border-gray-200">
              <h3 className="font-bold text-gray-900">Step 2: Sauda Effect (Gameplay)</h3>
              <p className="text-xs text-gray-500 font-medium">How your delivery performance affected the scores.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[600px]">
                <thead>
                  <tr className="bg-gray-50/50 border-b-2 border-gray-200">
                    <th className="p-3 font-bold text-gray-600">CP</th>
                    <th className="p-3 font-bold text-gray-600 text-center">Sauda F</th>
                    <th className="p-3 font-bold text-gray-600 text-center">Sauda C</th>
                    <th className="p-3 font-bold text-gray-600 text-center">Sauda I</th>
                    <th className="p-3 font-bold text-gray-900 text-center bg-gray-100">Final F</th>
                    <th className="p-3 font-bold text-gray-900 text-center bg-gray-100">Final C</th>
                    <th className="p-3 font-bold text-gray-900 text-center bg-gray-100">Final I</th>
                  </tr>
                </thead>
                <tbody>
                  {gs.cpHistory.map(cp => (
                    <tr key={cp.cp} className="border-b border-gray-100">
                      <td className="p-3 font-bold">CP {cp.cp}</td>
                      <td className="p-3 text-center text-gray-500 font-medium">{cp.saudaEffect.financial > 0 ? '+'+cp.saudaEffect.financial : cp.saudaEffect.financial}</td>
                      <td className="p-3 text-center text-gray-500 font-medium">{cp.saudaEffect.customer > 0 ? '+'+cp.saudaEffect.customer : cp.saudaEffect.customer}</td>
                      <td className="p-3 text-center text-gray-500 font-medium">{cp.saudaEffect.internal > 0 ? '+'+cp.saudaEffect.internal : cp.saudaEffect.internal}</td>
                      <td className="p-3 text-center font-bold bg-gray-50/50">{cp.pillarScores.financial}</td>
                      <td className="p-3 text-center font-bold bg-gray-50/50">{cp.pillarScores.customer}</td>
                      <td className="p-3 text-center font-bold bg-gray-50/50">{cp.pillarScores.internal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="game-card bg-gray-900 rounded-xl p-6 text-gray-300 font-mono text-sm border-gray-800">
            <p className="text-primary font-bold mb-2">// Score Calculation Formula</p>
            <p>Final Score = clamp( 50 + Setup_Total + Sauda_Effect, 0, 100 )</p>
            <p className="mt-4 text-gray-500 font-bold">Example (CP1 Financial):</p>
            <p>clamp( 50 + {gs.setupPoints.financial} + {gs.cpHistory[0].saudaEffect.financial}, 0, 100 ) = <span className="text-white font-bold">{gs.cpHistory[0].pillarScores.financial}</span></p>
          </div>
        </div>
      </div>
      <BottomNav onNext={() => go("FINAL")} nextLabel="View Final Results" />
    </div>
  );
};

const ScreenD7 = ({ gs, go, setGs }: ScreenProps) => {
  const last = gs.cpHistory[gs.cpHistory.length - 1];
  const sel = gs.growChoice;
  const isFinal = gs.checkpoint >= 5;

  const options = [
    { id: "new_loc", label: "Open a New Location", desc: "Expand your empire to a new area.", eligible: last.recognition >= 70, req: "Requires Recognition ≥ 70" },
    { id: "scale_up", label: "Improve Store Scale", desc: "Upgrade from Counter to Mini, or Mini to Dept.", eligible: last.profit >= 50000, req: "Requires Net Profit ≥ Rs 50,000" },
    { id: "hold", label: "Hold Steady", desc: "Keep current operations and optimize.", eligible: true, req: "" },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 relative flex flex-col">
      <BgIcon Icon={Map} />
      <div className="flex-1 max-w-4xl mx-auto w-full relative z-10">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">Growth Strategy</h1>
            <p className="text-gray-500 font-medium">Decide your next move based on your performance.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 mb-8">
          {options.map(opt => {
            const isSel = sel === opt.id;
            return (
              <button
                key={opt.id}
                disabled={!opt.eligible}
                onClick={() => setGs(p => ({ ...p, growChoice: opt.id }))}
                className={`game-card text-left p-6 rounded-2xl transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${!opt.eligible ? 'opacity-50 bg-gray-50 border-gray-200 cursor-not-allowed' : isSel ? 'border-primary bg-primary/5' : 'border-gray-200 bg-white hover:border-gray-300'}`}
              >
                <div>
                  <h3 className="font-bold text-gray-900 text-lg mb-1">{opt.label}</h3>
                  <p className="text-sm text-gray-500 font-medium">{opt.desc}</p>
                </div>
                <div className="text-right shrink-0">
                  {opt.eligible ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold uppercase tracking-wider border border-emerald-200"><CheckCircle size={14} /> Eligible</span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold uppercase tracking-wider border border-red-200"><XCircle size={14} /> {opt.req}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <BottomNav 
        onBack={() => go("BSC")} 
        onNext={() => {
          if (isFinal) go("FINAL");
          else {
            if (sel === "new_loc") {
              setGs(p => {
                const newStores = [...p.stores, {
                  id: "", name: `Store ${p.stores.length + 1}`, location: "", scale: "", selectedItems: [], stock: {},
                  prices: { staples:"standard", dairy:"standard", bakery:"standard", produce:"standard", care:"standard", utility:"standard" }
                }];
                return { ...p, checkpoint: p.checkpoint + 1, reopening: true, stores: newStores, currentStoreIdx: newStores.length - 1, screen: "D1" };
              });
            } else if (sel === "scale_up") {
              setGs(p => ({ ...p, checkpoint: p.checkpoint + 1, reopening: true, currentStoreIdx: 0, screen: "D2" }));
            } else {
              setGs(p => ({ ...p, checkpoint: p.checkpoint + 1, reopening: true, screen: "D4" }));
            }
          }
        }} 
        disabled={!sel} 
        nextLabel={isFinal ? "Finish Simulation" : "Start Next Checkpoint"} 
      />
    </div>
  );
};

const ScreenFinal = ({ gs, setGs }: ScreenProps) => {
  const totalRevenue = gs.cpHistory.reduce((sum, cp) => sum + cp.revenue, 0);
  const totalProfit = gs.cpHistory.reduce((sum, cp) => sum + cp.profit, 0);
  const totalFulfill = gs.cpHistory.reduce((sum, cp) => sum + cp.fulfilled, 0);
  const avgSat = Math.round(gs.cpHistory.reduce((sum, cp) => sum + cp.satisfaction, 0) / 5);
  
  const margin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0;
  const score = Math.round((totalFulfill / 60) * 40 + (avgSat / 100) * 60);
  
  let badge = { text: "Rising Shopkeeper 🌱", color: "text-emerald-700", bg: "bg-emerald-100 border-emerald-300" };
  if (score >= 80) badge = { text: "Master Merchant 🏆", color: "text-amber-700", bg: "bg-amber-100 border-amber-300" };
  else if (score >= 60) badge = { text: "Skilled Trader 📈", color: "text-blue-700", bg: "bg-blue-100 border-blue-300" };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-white/50 relative flex flex-col">
      <BgIcon Icon={Sparkles} />
      <div className="flex-1 max-w-5xl mx-auto w-full relative z-10">
        <div className="text-center mb-12">
          <div className={`inline-flex items-center px-6 py-2 rounded-full border-2 text-lg font-bold mb-6 ${badge.bg} ${badge.color}`}>
            {badge.text}
          </div>
          <h1 className="text-5xl font-display font-bold text-gray-900 mb-4">Simulation Complete!</h1>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed font-medium">
            <strong className="text-gray-900">{gs.playerName}</strong>, you've successfully run <strong className="text-gray-900">{gs.stores[0].name}</strong> through all 5 checkpoints — navigating Islamic financing, location strategy, inventory management, and customer service in Karachi.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-12">
          <MetricTile label="Capital in Hand" value={`Rs ${gs.capital.toLocaleString()}`} accent />
          <MetricTile label="Total Revenue" value={`Rs ${totalRevenue.toLocaleString()}`} />
          <MetricTile label="Total Net Profit" value={`Rs ${totalProfit.toLocaleString()}`} />
          <MetricTile label="Profit Margin" value={`${margin}%`} />
          <MetricTile label="Requests Served" value={`${totalFulfill}/60`} sub={`${Math.round((totalFulfill/60)*100)}% Rate`} />
        </div>

        <div className="game-card bg-white rounded-2xl overflow-hidden mb-12">
          <div className="bg-gray-900 p-6 text-white border-b-4 border-gray-800">
            <h3 className="font-display font-bold text-xl">Year in Review</h3>
            <p className="text-sm text-gray-400 font-medium">Checkpoint breakdown</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[600px]">
              <thead>
                <tr className="bg-gray-50 border-b-2 border-gray-200 text-sm">
                  <th className="p-4 font-bold text-gray-600">CP</th>
                  <th className="p-4 font-bold text-gray-600 text-center">Fulfilled</th>
                  <th className="p-4 font-bold text-gray-600 text-right">Revenue</th>
                  <th className="p-4 font-bold text-gray-600 text-right">Profit</th>
                  <th className="p-4 font-bold text-gray-600 text-center">F Score</th>
                  <th className="p-4 font-bold text-gray-600 text-center">C Score</th>
                  <th className="p-4 font-bold text-gray-600 text-center">I Score</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {gs.cpHistory.map(cp => (
                  <tr key={cp.cp} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="p-4 font-bold text-gray-900">CP {cp.cp}</td>
                    <td className="p-4 text-center font-bold">{cp.fulfilled}/12</td>
                    <td className="p-4 text-right text-gray-600 font-medium">Rs {cp.revenue.toLocaleString()}</td>
                    <td className={`p-4 text-right font-bold ${cp.profit > 0 ? 'text-emerald-600' : 'text-red-500'}`}>Rs {cp.profit.toLocaleString()}</td>
                    <td className="p-4 text-center font-bold text-gray-600">{cp.pillarScores.financial}</td>
                    <td className="p-4 text-center font-bold text-gray-600">{cp.pillarScores.customer}</td>
                    <td className="p-4 text-center font-bold text-gray-600">{cp.pillarScores.internal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="text-center pb-8">
          <button 
            onClick={() => setGs(INIT_STATE)}
            className="game-card inline-flex items-center gap-2 px-10 py-4 rounded-xl text-lg font-bold text-white bg-primary hover:bg-primary/90 border-pink-700 transition-all"
          >
            Finished (Play Again) <CheckCircle size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// ROOT APP COMPONENT
// ============================================================================

export default function App() {
  const [gs, setGs] = useState<GameState>(INIT_STATE);
  
  const go = useCallback((screen: ScreenId, extra?: Partial<GameState>) => {
    setGs(prev => ({ ...prev, screen, ...extra }));
  }, []);

  const handleGoG1 = useCallback(() => {
    setGs(prev => {
      const requests = generateRequests(prev.stores, prev.checkpoint);
      // Note: Stock carry forward is handled in D6 and D5's onNext logic now.
      return { ...prev, screen: "G1", reqIdx: 0, results: [], requests };
    });
  }, []);

  const goWithG1 = useCallback((screen: ScreenId, extra?: Partial<GameState>) => {
    if (screen === "G1") { handleGoG1(); return; }
    go(screen, extra);
  }, [go, handleGoG1]);

  const isLanding = gs.screen === "LANDING";
  const props: ScreenProps = { gs, go, setGs };

  return (
    <div className="h-[100dvh] w-screen flex overflow-hidden text-foreground">
      {!isLanding && <Sidebar gs={gs} go={go} />}
      <AnimatePresence mode="wait">
        <motion.div
          key={gs.screen}
          className={`flex flex-col overflow-hidden h-full ${isLanding ? "w-full" : "flex-1"}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          {gs.screen === "LANDING"   && <ScreenLanding  {...props} />}
          {gs.screen === "I1"        && <ScreenI1       {...props} />}
          {gs.screen === "I2"        && <ScreenI2       {...props} />}
          {gs.screen === "D3"        && <ScreenD3       {...props} />}
          {gs.screen === "D1"        && <ScreenD1       {...props} />}
          {gs.screen === "D2"        && <ScreenD2       {...props} />}
          {gs.screen === "D4"        && <ScreenD4       {...props} />}
          {gs.screen === "D5"        && <ScreenD5       {...props} />}
          {gs.screen === "P1"        && <ScreenP1       {...props} />}
          {gs.screen === "D6"        && <ScreenD6       {...{ ...props, go: goWithG1 }} />}
          {gs.screen === "G1"        && <ScreenG1       {...props} />}
          {gs.screen === "G2"        && <ScreenG2       {...props} />}
          {gs.screen === "G4"        && <ScreenG4       {...props} />}
          {gs.screen === "BSC"       && <ScreenBSC      {...props} />}
          {gs.screen === "BSC_FINAL" && <ScreenBSCFinal {...props} />}
          {gs.screen === "D7"        && <ScreenD7       {...props} />}
          {gs.screen === "FINAL"     && <ScreenFinal    {...props} />}
        </motion.div>
      </AnimatePresence>
      
      {/* Bubbly AI Chatbot */}
      {!isLanding && <BubblyChat gs={gs} />}
    </div>
  );
}
