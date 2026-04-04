'use client';

import { useState, useEffect, useCallback } from 'react';
import { useGeoLocation } from '@/hooks/useGeoLocation';
import { calculateDistance, formatDistance } from '@/utils/geo';
import { firestore } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { NumberCounter } from '@/components/ui/NumberCounter';
import { RadarPulse } from '@/components/ui/RadarPulse';
import { CustomDropdown } from '@/components/ui/CustomDropdown';
import { LinearProgressBar } from '@/components/ui/LinearProgressBar';
import { SkeletonLoader } from '@/components/ui/SkeletonLoader';
import { Plus, X, Crosshair, Map as MapIcon, Rows, Settings } from 'lucide-react';
import dynamic from 'next/dynamic';

const TacticalMap = dynamic(() => import('@/components/ui/TacticalMap').then(mod => mod.TacticalMap), { ssr: false });

interface Venue {
  id: string;
  name: string;
  address: string;
  coordinates: { lat: number; lng: number };
  estimated_headcount: number;
  locationType: 'Transport' | 'Academic' | 'Commercial' | 'Other';
  crowdLevel: 'low' | 'medium' | 'high';
  max_capacity: number;
  lastUpdated: number;
  active_nodes: number;
}

const MULTIPLIERS = { Transport: 15, Academic: 8, Commercial: 5, Other: 3 };
const SIGNAL_TIMEOUT = 300;
const TEST_LOCATIONS = {
  current: null,
  cst: { lat: 19.076, lng: 72.8777, name: 'CST Station' },
  user: { lat: 19.214298, lng: 72.872187, name: 'Your Position' },
};

function calculateSyntheticHeadcount(baseCount: number, locationType: string, activeNodes: number) {
  const multiplier = MULTIPLIERS[locationType as keyof typeof MULTIPLIERS] || 3;
  const randomBuffer = Math.floor(Math.random() * 10) - 5;
  const calculatedCount = Math.max(0, (activeNodes * multiplier) + randomBuffer);
  const finalCount = Math.max(calculatedCount, baseCount);
  let confidence = activeNodes > 0 ? Math.min(99, 90 + Math.floor(Math.random() * 8)) : 75;
  return { headcount: finalCount, confidence };
}

const pageVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 30 } },
  exit: { opacity: 0, x: -20, transition: { duration: 0.2 } }
};

export default function CIVIQDashboard() {
  const { coordinates, accuracy, error, isLoading: geoLoading } = useGeoLocation();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [userDistance, setUserDistance] = useState<number | null>(null);
  const [isWithin500m, setIsWithin500m] = useState(false);
  const [reportHeadcount, setReportHeadcount] = useState<string>('');
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [testLocation, setTestLocation] = useState<'current' | 'cst' | 'user'>('current');
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'OVERWATCH' | 'LOGS' | 'SYSTEM'>('OVERWATCH');
  const [mapMode, setMapMode] = useState<'VECTOR' | 'SATELLITE'>('VECTOR');
  const [flash, setFlash] = useState(false);

  const displayCoords = testLocation === 'current' ? coordinates : testLocation === 'cst' ? TEST_LOCATIONS.cst : TEST_LOCATIONS.user;

  useEffect(() => {
    if (!firestore) return;
    const q = query(collection(firestore, 'locations'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const venueData = snapshot.docs.map(doc => {
        const data = doc.data();
        const activeNodes = data.active_nodes || [];
        const filteredCount = Array.isArray(activeNodes) ? activeNodes.filter((n: any) => n.last_seen && ((Date.now() / 1000) - n.last_seen <= SIGNAL_TIMEOUT)).length : 0;
        return {
          id: doc.id, name: data.name || '', address: data.address || '',
          coordinates: { lat: data.lat || 0, lng: data.lng || 0 },
          estimated_headcount: data.estimated_headcount || 0,
          locationType: (data.locationType || 'Other') as Venue['locationType'],
          crowdLevel: data.status === 'open' || data.status === 'low' ? 'low' : data.status === 'moderate' || data.status === 'medium' ? 'medium' : 'high',
          max_capacity: data.max_capacity || 100, lastUpdated: data.lastUpdated?.toMillis?.() || data.lastUpdated || Date.now(), active_nodes: filteredCount,
        };
      }) as Venue[];
      setVenues(venueData);
      setIsInitializing(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!displayCoords || venues.length === 0) return;
    const sorted = [...venues].sort((a, b) => calculateDistance(displayCoords, a.coordinates) - calculateDistance(displayCoords, b.coordinates));
    const nearest = sorted[0];
    setSelectedVenue((prev) => prev && venues.find(v => v.id === prev.id) ? venues.find(v => v.id === prev.id)! : nearest);
    const selectedDist = calculateDistance(displayCoords, (selectedVenue || nearest).coordinates);
    setUserDistance(selectedDist);
    setIsWithin500m(selectedDist <= 500);
  }, [displayCoords, venues, selectedVenue]);

  const handleSubmit = async () => {
    if (!selectedVenue || !isWithin500m || !reportHeadcount || !firestore) return;
    setSubmitStatus('submitting');
    try {
      await setDoc(doc(firestore, 'locations', selectedVenue.id), { reported_headcount: parseInt(reportHeadcount, 10), last_reporter: serverTimestamp() }, { merge: true });
      setFlash(true);
      setTimeout(() => setFlash(false), 300);
      setSubmitStatus('idle');
      setReportHeadcount('');
      setIsActionSheetOpen(false);
    } catch {
      setSubmitStatus('error');
    }
  };

  const getCapacityPercent = (c: number, m: number) => Math.min(100, Math.round((c / m) * 100));
  const getCapacityColor = (p: number) => p < 50 ? '#39FF14' : p < 80 ? '#FBBC04' : '#EA4335';

  const heroVenue = selectedVenue;
  const heroHeadcount = heroVenue ? calculateSyntheticHeadcount(heroVenue.estimated_headcount, heroVenue.locationType, heroVenue.active_nodes).headcount : 0;

  // The Glass Cockpit HUD Background Toggle
  const isSatelite = mapMode === 'SATELLITE';

  return (
    <>
      {/* Global Background Map (Z=0) */}
      <div className="fixed inset-0 z-0 pointer-events-auto bg-black">
        {isSatelite ? (
          <TacticalMap center={heroVenue ? heroVenue.coordinates : displayCoords || undefined} />
        ) : (
          <div className="w-full h-full bg-[#000000] swiss-grid opacity-20 pointer-events-none" />
        )}
      </div>

      <motion.main 
        animate={{ backgroundColor: isSatelite ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,1)' }}
        className="min-[100dvh] text-[#FFFFFF] font-mono select-none relative z-10 max-w-lg mx-auto flex flex-col pointer-events-none"
      >
        {/* Global Overlays */}
      <div className="scanlines" />
      {flash && <div className="fixed inset-0 pointer-events-none z-[100] transmission-flash" />}

      {/* Sticky Top Header */}
      <motion.header 
        animate={{ 
          backdropFilter: isSatelite ? 'blur(12px)' : 'blur(0px)',
          backgroundColor: isSatelite ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,1)'
        }}
        className="sticky top-0 z-40 border-b-[0.5px] border-[#39FF14]/50 px-4 py-3 pt-[calc(env(safe-area-inset-top)+12px)] flex items-center justify-between will-change-backdrop-filter pointer-events-auto"
      >
        <div className="flex items-center gap-2">
          <RadarPulse color="#39FF14" />
          <span className="text-[12px] font-bold text-[#39FF14] tracking-widest neon-text">SYS:ON</span>
        </div>
        <div className="text-right pointer-events-auto flex items-center gap-3">
          {isSatelite && (
            <button 
               onClick={() => document.dispatchEvent(new CustomEvent('map-locate-user'))}
               className="px-2 py-1 bg-black/40 border-[0.5px] border-[#00F0FF] text-[#00F0FF] text-[9px] font-bold tracking-widest uppercase active:scale-95 transition-transform backdrop-blur-md shadow-[0_0_8px_rgba(0,240,255,0.3)] hover:bg-[#00F0FF]/10"
            >
               LOCATE
            </button>
          )}
          {displayCoords ? (
            <div className={`text-[10px] tracking-widest flex flex-col items-end drop-shadow-md font-bold ${isSatelite ? 'text-[#00F0FF]' : 'text-[#9AA0A6]'}`}>
              <span>[LAT:{(displayCoords.lat).toFixed(4)}]</span>
              <span>[LNG:{(displayCoords.lng).toFixed(4)}]</span>
            </div>
          ) : <span className="text-[10px] text-[#9AA0A6] tracking-widest animate-pulse">AWAITING COORDS...</span>}
        </div>
      </motion.header>

      {/* Tab Content Wrapper */}
      <div className={`flex-1 relative pb-[120px] ${activeTab === 'OVERWATCH' ? 'pointer-events-none' : 'overflow-y-auto pointer-events-auto'}`}>
        <AnimatePresence mode="wait">
          
          {/* OVERWATCH TAB */}
          {activeTab === 'OVERWATCH' && (
            <motion.div key="OVERWATCH" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="flex flex-col h-full relative z-20 pointer-events-none">
              
              {/* Map Toggle Controls */}
              <motion.div 
                 animate={{ backgroundColor: isSatelite ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,1)' }}
                 className="p-4 flex items-center justify-between border-b-[0.5px] border-white/10 relative z-20 backdrop-blur-md will-change-backdrop-filter pointer-events-auto"
              >
                 <span className="text-[10px] uppercase text-[#9AA0A6] tracking-widest font-bold">RADAR MODE</span>
                 <div className="flex bg-black/40 p-1 border-[0.5px] border-white/10 backdrop-blur-md">
                    <button onClick={() => setMapMode('VECTOR')} className={`px-3 py-1 text-[10px] font-bold uppercase transition-all ${!isSatelite ? 'bg-[#39FF14] text-black shadow-[0_0_10px_#39FF14]' : 'text-[#9AA0A6]'}`}>VECTOR</button>
                    <button onClick={() => setMapMode('SATELLITE')} className={`px-3 py-1 text-[10px] font-bold uppercase transition-all ${isSatelite ? 'bg-[#39FF14] text-black shadow-[0_0_10px_#39FF14]' : 'text-[#9AA0A6]'}`}>SATELLITE</button>
                 </div>
              </motion.div>

              {/* Hero HUD Elements */}
              <div className="relative flex-1 flex flex-col items-center justify-center pointer-events-none z-10 py-20 px-4 min-h-[50vh]">
                <p className="text-[11px] text-[#39FF14] uppercase tracking-[0.1em] font-bold shadow-black drop-shadow-md neon-text text-center mb-6">
                  LIVE NODE DENSITY
                </p>
                
                {/* [ BRACKETS ] */}
                <div className="flex items-center justify-center gap-4">
                   <span className="text-6xl md:text-7xl font-light text-[#9AA0A6]/50">[</span>
                   <p className="text-8xl md:text-9xl font-bold heavy-neon-glow my-2 text-[#FFFFFF]">
                     {heroVenue ? <NumberCounter value={heroHeadcount} decimals={0} /> : '---'}
                   </p>
                   <span className="text-6xl md:text-7xl font-light text-[#9AA0A6]/50">]</span>
                </div>

                <p className="text-[14px] text-[#FFFFFF] font-bold tracking-[0.05em] uppercase px-4 drop-shadow-md mt-6">
                  {heroVenue ? heroVenue.name : 'NO FOCUS'}
                </p>
                {heroVenue && (
                  <motion.div 
                    animate={{ backgroundColor: isSatelite ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.8)' }}
                    className="mt-3 px-3 py-1 border-[0.5px] border-[#39FF14]/50 text-[10px] uppercase text-[#39FF14] backdrop-blur-md will-change-backdrop-filter flex items-center gap-2 pointer-events-auto"
                  >
                     <Crosshair size={12} /> TARGET LOCKED | {userDistance ? formatDistance(userDistance) : '—'}
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* LOGS TAB */}
          {activeTab === 'LOGS' && (
            <motion.div key="LOGS" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="p-4 z-20 relative min-h-[50vh]">
               <p className="text-[11px] text-[#9AA0A6] uppercase tracking-[0.05em] mb-3 backdrop-blur-sm inline-block px-2 bg-black/40 border border-white/10 will-change-backdrop-filter">GRID STATUS LOGS</p>
               <div className="flex flex-col gap-3">
                 {isInitializing ? (
                   <><SkeletonLoader /><SkeletonLoader /></>
                 ) : venues.length === 0 ? (
                   <div className="py-8 text-center border-[0.5px] border-white/10 bg-black/40 backdrop-blur-md will-change-backdrop-filter">
                     <span className="text-[11px] text-[#9AA0A6]">NO ZONES DETECTED</span>
                   </div>
                 ) : venues.map(venue => {
                    const { headcount, confidence } = calculateSyntheticHeadcount(venue.estimated_headcount, venue.locationType, venue.active_nodes);
                    const capPct = getCapacityPercent(headcount, venue.max_capacity);
                    return (
                      <motion.div 
                        initial={{ backgroundColor: 'rgba(0,0,0,1)' }}
                        animate={{ backgroundColor: isSatelite ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.9)' }}
                        key={venue.id} 
                        className="flex flex-col p-4 border border-white/10 backdrop-blur-md will-change-backdrop-filter pointer-events-auto"
                      >
                        <div className="flex items-center justify-between font-bold mb-2">
                           <span className="text-[12px] uppercase truncate text-[#FFFFFF] drop-shadow-md">{venue.name}</span>
                           <span className="text-[11px] text-[#39FF14] neon-text">{headcount} ENTS</span>
                        </div>
                        <LinearProgressBar percent={capPct} color={getCapacityColor(capPct)} />
                        <div className="flex items-center justify-between mt-3 text-[10px] text-[#9AA0A6] uppercase tracking-widest drop-shadow-md">
                           <span>CONFIDENCE: {confidence}%</span>
                           <div className="flex items-center gap-1">
                              <span>{venue.crowdLevel === 'low' ? 'STABLE' : 'ALERT'}</span>
                              <RadarPulse color={venue.crowdLevel === 'low' ? '#39FF14' : '#EA4335'} />
                           </div>
                        </div>
                      </motion.div>
                    )
                 })}
               </div>
            </motion.div>
          )}

          {/* SYSTEM TAB */}
          {activeTab === 'SYSTEM' && (
            <motion.div key="SYSTEM" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="p-4 z-20 relative text-center text-[#9AA0A6] text-[11px] uppercase tracking-widest py-10 min-h-[50vh]">
               SYSTEM CONFIGURATION LOCKED. <br/> [ PHASE 4 AWAITING CLEARANCE ]
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Floating Action Button */}
      {activeTab !== 'SYSTEM' && (
        <button onClick={() => setIsActionSheetOpen(true)} className="fixed bottom-[calc(env(safe-area-inset-bottom)+80px)] right-6 w-14 h-14 bg-black/80 backdrop-blur-md border-[1px] border-[#39FF14] rounded-none flex items-center justify-center z-40 active:scale-95 active:bg-[#39FF14] active:text-black transition-all appearance-none shadow-[0_0_15px_rgba(57,255,20,0.6)] text-[#39FF14] will-change-backdrop-filter pointer-events-auto">
          <Plus size={28} />
        </button>
      )}

      {/* Fixed Bottom Naval Navigation */}
      <motion.nav 
        animate={{ 
          backdropFilter: isSatelite ? 'blur(12px)' : 'blur(0px)',
          backgroundColor: isSatelite ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,1)'
        }}
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#39FF14]/30 pb-[calc(env(safe-area-inset-bottom)+12px)] max-w-lg mx-auto flex pt-3 items-center px-2 will-change-backdrop-filter pointer-events-auto"
      >
         {[
           { id: 'OVERWATCH', icon: MapIcon, label: 'OVERWATCH' },
           { id: 'LOGS', icon: Rows, label: 'LOGS' },
           { id: 'SYSTEM', icon: Settings, label: 'SYSTEM' }
         ].map(tab => {
           const isActive = activeTab === tab.id;
           return (
             <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex-1 flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform appearance-none ${isActive ? 'text-[#39FF14] neon-text drop-shadow-[0_0_5px_rgba(57,255,20,1)]' : 'text-[#9AA0A6]'}`}>
               <tab.icon size={20} strokeWidth={isActive ? 2.5 : 1.5} />
               <span className="text-[9px] font-bold tracking-widest">{tab.label}</span>
             </button>
           )
         })}
      </motion.nav>

      {/* Action Sheet Background Overlay */}
      <AnimatePresence>
        {isActionSheetOpen && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={() => setIsActionSheetOpen(false)} className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] touch-none will-change-backdrop-filter pointer-events-auto" />}
      </AnimatePresence>

      {/* Action Sheet */}
      <AnimatePresence>
        {isActionSheetOpen && (
           <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ duration: 0.2, ease: "easeOut" }} className="fixed bottom-0 left-0 right-0 z-[70] bg-black/60 backdrop-blur-xl border-t-[1px] border-[#39FF14] max-h-[85vh] overflow-y-auto w-full max-w-lg mx-auto shadow-[0_-5px_20px_rgba(57,255,20,0.15)] pb-[calc(env(safe-area-inset-bottom)+20px)] will-change-backdrop-filter pointer-events-auto">
             <div className="sticky top-0 bg-black/80 backdrop-blur-md z-10 px-6 py-4 border-b-[0.5px] border-[#202124] flex items-center justify-between will-change-backdrop-filter">
                <span className="text-[12px] font-bold text-[#39FF14] tracking-widest neon-text">MANUAL INJECTION</span>
                <button onClick={() => setIsActionSheetOpen(false)} className="p-2 -mr-2 text-[#9AA0A6] active:scale-95 appearance-none"><X size={20} /></button>
             </div>
             <div className="p-6 flex flex-col gap-6">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.05em] text-[#9AA0A6] mb-2 drop-shadow-md">1. TEST CALIBRATION CONTEXT</p>
                  <CustomDropdown value={testLocation} onChange={(val) => setTestLocation(val as any)} options={[{ value: 'current', label: 'HW LOCATOR [GPS_RAW]' }, { value: 'cst', label: 'NODE [19.076, 72.877]' }, { value: 'user', label: 'STATIC RELAY [19.214, 72.872]' }]} />
                </div>
                <div className="mt-2">
                  <p className="text-[10px] uppercase tracking-[0.05em] text-[#9AA0A6] mb-2 drop-shadow-md">2. TARGET ZONE</p>
                  <CustomDropdown value={selectedVenue?.id || ''} onChange={(val) => { const venue = venues.find(v => v.id === val); setSelectedVenue(venue || null); if (venue && displayCoords) { const dist = calculateDistance(displayCoords, venue.coordinates); setUserDistance(dist); setIsWithin500m(dist <= 500); } }} options={venues.map(v => ({ value: v.id, label: v.name }))} placeholder="— SELECT TARGET —" />
                </div>
                <div className="mt-2">
                  <p className="text-[10px] uppercase tracking-[0.05em] text-[#9AA0A6] mb-2 drop-shadow-md">3. OBSERVED ENTITIES</p>
                  <input type="number" min="0" placeholder="ENTER COUNT" value={reportHeadcount} onChange={(e) => setReportHeadcount(e.target.value)} className="w-full bg-black/40 backdrop-blur-md border border-white/10 text-[#FFFFFF] text-[13px] px-4 min-h-[48px] font-mono focus:outline-none transition-all duration-200 tracking-[0.05em] rounded-none appearance-none placeholder-[#9AA0A6] hover:bg-black/60 active:border-[#39FF14] will-change-backdrop-filter" />
                </div>
                <div className={`mt-2 px-4 py-3 min-h-[48px] text-[11px] uppercase tracking-[0.05em] flex items-center justify-center gap-3 bg-black/40 backdrop-blur-md rounded-none will-change-backdrop-filter ${isWithin500m ? 'border-[1px] border-[#39FF14] text-[#39FF14]' : 'border-[0.5px] border-[#EA4335]/50 text-[#EA4335]'}`}>
                    {isWithin500m ? <><RadarPulse color="#39FF14" /><span>SYNC MATCHED</span></> : <><span className="w-2 h-2 bg-[#EA4335] block rounded-none opacity-50" /><span>OUT OF RANGE</span></>}
                </div>
                <button disabled={!selectedVenue || !reportHeadcount || !isWithin500m || submitStatus === 'submitting'} onClick={handleSubmit} className={`mt-4 w-full px-8 min-h-[48px] text-[12px] font-bold tracking-[0.05em] uppercase transition-all duration-200 appearance-none flex items-center justify-center rounded-none active:scale-95 ${!selectedVenue || !reportHeadcount || !isWithin500m || submitStatus === 'submitting' ? 'bg-black/20 text-[#9AA0A6] border-[0.5px] border-[#202124] backdrop-blur-sm' : 'bg-[#39FF14]/90 backdrop-blur-md text-[#000000] active:brightness-125 cursor-pointer shadow-[0_0_15px_rgba(57,255,20,0.6)] border border-[#39FF14]'}`}>
                  {submitStatus === 'submitting' ? 'UPLINKING...' : submitStatus === 'error' ? 'UPLINK FAILED' : 'EXECUTE INJECTION'}
                </button>
             </div>
           </motion.div>
        )}
      </AnimatePresence>
    </motion.main>
    </>
  );
}