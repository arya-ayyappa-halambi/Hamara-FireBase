import React, { useState, useEffect } from 'react';
import { Zap, ShieldCheck, Server, ChevronLeft, ChevronRight } from 'lucide-react';

const SLIDES = [
  {
    id: 1,
    tag: "Why FlareBase?",
    title: "Bring your data to life with zero friction.",
    description: "A self-hosted, lightweight BaaS engine delivering NoSQL document storage backed by SQLite WAL-mode performance, real-time WebSockets, and object storage out-of-the-box.",
    icon: Zap,
    image: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?q=80&w=2034&auto=format&fit=crop"
  },
  {
    id: 2,
    tag: "Zero-Trust Security",
    title: "Two-Tier Encryption & VM Sandboxing.",
    description: "Field-level data protected via AES-256-GCM (DEK/KEK derivation), isolated Node.js vm2 security rules, RS256 JWKS token signing, and 15-minute brute-force lockouts.",
    icon: ShieldCheck,
    image: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=2070&auto=format&fit=crop"
  },
  {
    id: 3,
    tag: "Enterprise Console",
    title: "Live Infrastructure & Real-Time Telemetry.",
    description: "Monitor live CPU load, V8 memory heap allocation, active WebSocket connections, and SQLite WAL query latency using built-in Chart.js analytics.",
    icon: Server,
    image: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=2070&auto=format&fit=crop"
  }
];

export default function FlareBaseRightPanel() {
  const [currentIdx, setCurrentIdx] = useState(0);

  // Auto-scroll every 5 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIdx((prev) => (prev + 1) % SLIDES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [currentIdx]);

  const handleNext = () => {
    setCurrentIdx((prev) => (prev + 1) % SLIDES.length);
  };

  const handlePrev = () => {
    setCurrentIdx((prev) => (prev - 1 + SLIDES.length) % SLIDES.length);
  };

  const goToSlide = (idx) => {
    setCurrentIdx(idx);
  };

  return (
    <div className="relative w-full h-full bg-slate-950 rounded-r-2xl overflow-hidden flex flex-col justify-between">
      {/* Background Images with Crossfade Transition */}
      {SLIDES.map((slide, idx) => (
        <div
          key={slide.id}
          className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
            idx === currentIdx ? "opacity-100 z-10" : "opacity-0 z-0"
          }`}
        >
          <img
            src={slide.image}
            alt={slide.title}
            className="w-full h-full object-cover opacity-40 mix-blend-overlay"
          />
          {/* Heavy Gradient Mask for Contrast */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-transparent pointer-events-none"></div>
        </div>
      ))}

      {/* Content Overlay */}
      <div className="relative z-20 flex flex-col h-full p-10 md:p-14 justify-between">
        
        {/* Top Header Badge */}
        <div className="flex justify-end w-full">
          {SLIDES.map((slide, idx) => {
            const Icon = slide.icon;
            return (
              <div
                key={`badge-${slide.id}`}
                className={`transition-all duration-1000 ease-in-out transform ${
                  idx === currentIdx
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 -translate-y-4 hidden"
                }`}
              >
                {idx === currentIdx && (
                  <div className="inline-flex items-center space-x-2 bg-purple-500/20 border border-purple-500/30 backdrop-blur-md px-4 py-2 rounded-full shadow-lg">
                    <Icon className="w-4 h-4 text-purple-400" />
                    <span className="text-sm font-semibold text-purple-300 tracking-wide">
                      {slide.tag}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Text Content & Controls */}
        <div className="mt-auto">
          {SLIDES.map((slide, idx) => (
            <div
              key={`content-${slide.id}`}
              className={`transition-all duration-1000 ease-in-out transform ${
                idx === currentIdx
                  ? "opacity-100 translate-x-0 relative"
                  : "opacity-0 translate-x-8 absolute pointer-events-none invisible"
              }`}
            >
              {/* Dark Translucent Glassmorphic Card */}
              <div className="bg-slate-900/60 border border-slate-800 backdrop-blur-md p-8 rounded-2xl shadow-2xl">
                <h2 className="text-3xl lg:text-4xl font-extrabold text-white mb-4 leading-tight">
                  {slide.title}
                </h2>
                <p className="text-base lg:text-lg text-slate-300 leading-relaxed max-w-xl">
                  {slide.description}
                </p>
              </div>
            </div>
          ))}

          {/* Bottom Control Bar */}
          <div className="mt-8 flex items-center justify-between">
            {/* Progress Bar Indicators */}
            <div className="flex space-x-3">
              {SLIDES.map((_, idx) => (
                <button
                  key={`dot-${idx}`}
                  onClick={() => goToSlide(idx)}
                  className={`h-1.5 rounded-full transition-all duration-500 focus:outline-none ${
                    idx === currentIdx
                      ? "w-10 bg-purple-500"
                      : "w-4 bg-white/20 hover:bg-white/40"
                  }`}
                  aria-label={`Go to slide ${idx + 1}`}
                />
              ))}
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center space-x-3">
              <button
                onClick={handlePrev}
                className="p-3 rounded-full bg-slate-900/60 border border-slate-800 hover:bg-slate-800/80 text-white transition-all backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                aria-label="Previous Slide"
              >
                <ChevronLeft className="w-5 h-5 text-purple-400" />
              </button>
              <button
                onClick={handleNext}
                className="p-3 rounded-full bg-slate-900/60 border border-slate-800 hover:bg-slate-800/80 text-white transition-all backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                aria-label="Next Slide"
              >
                <ChevronRight className="w-5 h-5 text-purple-400" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
