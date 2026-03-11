// src/screens/ReadPage.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useApp } from '../App';
import { useRoom } from '../Useroom';
import {
	getRoom,
	downloadPdfChunked,
	deleteRoom,
	saveMusicState,
	subscribeMusicState,
} from '../Db';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const timeAgo = (ts) => {
	const d = Math.floor((Date.now() - ts) / 1000);
	if (d < 5) return 'just now';
	if (d < 60) return `${d}s ago`;
	if (d < 3600) return `${Math.floor(d / 60)}m ago`;
	return `${Math.floor(d / 3600)}h ago`;
};

// ─── CSS ──────────────────────────────────────────────────────────────────────
const READER_CSS = `
  @keyframes slideRight  { from { opacity:0; transform:translateX(100%); } to { opacity:1; transform:translateX(0); } }
  @keyframes slideLeft   { from { opacity:0; transform:translateX(-100%); } to { opacity:1; transform:translateX(0); } }
  @keyframes slideUpSheet { from { opacity:0; transform:translateY(100%); } to { opacity:1; transform:translateY(0); } }
  @keyframes floatBob    { 0%,100%{ transform:translateY(0); } 50%{ transform:translateY(-5px); } }
  @keyframes popIn       { from { opacity:0; transform:scale(0.85) translateY(8px); } to { opacity:1; transform:scale(1) translateY(0); } }
  @keyframes pulse       { 0%,100%{ opacity:1; } 50%{ opacity:0.35; } }
  @keyframes ripple      { 0%{ transform:scale(1); opacity:0.6; } 100%{ transform:scale(2.4); opacity:0; } }
  @keyframes bounce      { 0%,100%{ transform:translateY(0); } 40%{ transform:translateY(-4px); } }
  @keyframes slideUp     { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
  @keyframes spin        { to { transform:rotate(360deg); } }
  .chat-sidebar   { animation: slideRight 0.3s cubic-bezier(0.4,0,0.2,1) both; }
  .toc-sidebar    { animation: slideLeft 0.3s cubic-bezier(0.4,0,0.2,1) both; }
  .music-sidebar  { animation: slideRight 0.3s cubic-bezier(0.4,0,0.2,1) both; }
  .bottom-sheet   { animation: slideUpSheet 0.32s cubic-bezier(0.4,0,0.2,1) both; }
  .msg-bubble     { animation: slideUp 0.22s ease both; }
  .toast-pop      { animation: popIn 0.28s cubic-bezier(0.34,1.56,0.64,1) both; }
  .page-btn       { transition: all 0.18s ease; }
  .page-btn:hover:not(:disabled) { opacity:0.8; transform:scale(1.06); }
  .reader-scroll::-webkit-scrollbar { display: none; }
  .reader-scroll  { -ms-overflow-style: none; scrollbar-width: none; }
  .chat-scroll::-webkit-scrollbar { width: 3px; }
  .chat-scroll::-webkit-scrollbar-thumb { background: var(--paper-deep); border-radius: 3px; }
  .toc-scroll::-webkit-scrollbar { width: 3px; }
  .toc-scroll::-webkit-scrollbar-thumb { background: var(--paper-deep); border-radius: 3px; }
  .toc-item { transition: background 0.15s ease, color 0.15s ease; }
  .toc-item:hover { background: var(--paper-mid) !important; }
  .avatar-wrap { position: relative; display: inline-flex; align-items: center; justify-content: center; }
  .avatar-tooltip {
    position: absolute; bottom: calc(100% + 10px); left: 50%; transform: translateX(-50%);
    background: var(--ink); color: #fff; border-radius: 8px; padding: 4px 10px;
    font-size: 0.65rem; font-weight: 600; white-space: nowrap; pointer-events: none;
    opacity: 0; transition: opacity 0.15s ease;
    box-shadow: 0 4px 12px rgba(26,18,8,0.25); z-index: 99;
  }
  .avatar-tooltip::after {
    content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
    border: 4px solid transparent; border-top-color: var(--ink);
  }
  .avatar-wrap:hover .avatar-tooltip { opacity: 1; }
  @keyframes spinEq  { 0%,100%{ transform:scaleY(0.4); } 50%{ transform:scaleY(1); } }
  .eq-bar { display:inline-block; width:3px; border-radius:2px; background:#1DB954; animation:spinEq 0.8s ease-in-out infinite; }
  .sp-btn { background:none; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:transform 0.15s, opacity 0.15s; border-radius:50%; }
  .sp-btn:hover { transform:scale(1.12); opacity:0.85; }
  .sp-btn:active { transform:scale(0.94); }
  .sp-btn:disabled { opacity:0.3; cursor:not-allowed; transform:none; }
  .sp-track-range { -webkit-appearance:none; appearance:none; height:4px; border-radius:4px; outline:none; cursor:pointer; background:transparent; }
  .sp-track-range::-webkit-slider-thumb { -webkit-appearance:none; width:14px; height:14px; border-radius:50%; background:#fff; cursor:pointer; box-shadow:0 2px 6px rgba(0,0,0,0.4); }
  .sp-track-range::-webkit-slider-runnable-track { height:4px; border-radius:4px; }
  .sp-vol-range { -webkit-appearance:none; appearance:none; height:3px; border-radius:3px; outline:none; cursor:pointer; }
  .sp-vol-range::-webkit-slider-thumb { -webkit-appearance:none; width:11px; height:11px; border-radius:50%; background:#fff; cursor:pointer; }
  @keyframes spSpin { to { transform:rotate(360deg); } }
  @keyframes spPulse { 0%,100%{box-shadow:0 0 0 0 rgba(29,185,84,0.4);} 50%{box-shadow:0 0 0 14px rgba(29,185,84,0);} }

  /* ── Mobile bottom nav bar ── */
  .mobile-nav-bar {
    display: none;
  }
  .desktop-float {
    display: flex;
  }

  @media (max-width: 768px) {
    .mobile-nav-bar {
      display: flex !important;
    }
    .desktop-float {
      display: none !important;
    }
    .sidebar-desktop {
      display: none !important;
    }
  }

  /* Sheet overlay backdrop */
  .sheet-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(26,18,8,0.45);
    z-index: 70;
    backdrop-filter: blur(2px);
  }

  /* Bottom sheet container */
  .side-sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 80;
    border-radius: 20px 20px 0 0;
    overflow: hidden;
    max-height: 88vh;
    display: flex;
    flex-direction: column;
  }

  /* Sheet drag handle */
  .sheet-handle {
    width: 36px;
    height: 4px;
    background: var(--paper-deep);
    border-radius: 2px;
    margin: 10px auto 4px;
    flex-shrink: 0;
  }

  /* Music sheet is dark */
  .side-sheet.music-sheet {
    background: #0d0d0d;
  }
  .side-sheet.light-sheet {
    background: #fff;
  }

  @media (min-width: 769px) {
    .side-sheet {
      position: static;
      border-radius: 0;
      max-height: none;
      height: 100%;
    }
    .sheet-backdrop {
      display: none;
    }
    .sheet-handle {
      display: none;
    }
  }
`;

function injectReaderStyles() {
	if (document.getElementById('reader-styles')) return;
	const s = document.createElement('style');
	s.id = 'reader-styles';
	s.textContent = READER_CSS;
	document.head.appendChild(s);
}

// ─── Hook: detect mobile ──────────────────────────────────────────────────────
function useIsMobile() {
	const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
	useEffect(() => {
		const handler = () => setIsMobile(window.innerWidth <= 768);
		window.addEventListener('resize', handler);
		return () => window.removeEventListener('resize', handler);
	}, []);
	return isMobile;
}

// ─── PDF Canvas Renderer ──────────────────────────────────────────────────────
function PdfPage({ pdfDoc, pageNum }) {
	const canvasRef = useRef(null);
	const renderRef = useRef(null);

	useEffect(() => {
		if (!pdfDoc || !canvasRef.current) return;
		let cancelled = false;
		if (renderRef.current) {
			renderRef.current.cancel();
			renderRef.current = null;
		}

		pdfDoc.getPage(pageNum).then((page) => {
			if (cancelled || !canvasRef.current) return;
			const container = canvasRef.current.parentElement;
			const isMob = window.innerWidth <= 768;

			const containerWidth = container ? container.clientWidth : window.innerWidth;
			// On mobile: fit the page to the visible area height (header ~48px + nav ~72px = ~120px used)
			// so the full page is visible without needing to scroll
			const availableHeight = isMob
				? window.innerHeight - 48 - 74 // header + nav bar
				: window.innerHeight - 48;

			// devicePixelRatio makes text crisp on retina / high-DPI screens
			const dpr = Math.min(window.devicePixelRatio || 1, 3);

			const baseVp = page.getViewport({ scale: 1 });

			let cssScale;
			if (isMob) {
				// Fit by height first, but never exceed width
				const scaleByHeight = availableHeight / baseVp.height;
				const scaleByWidth = containerWidth / baseVp.width;
				cssScale = Math.min(scaleByHeight, scaleByWidth);
			} else {
				// Desktop: fit to container width, capped
				cssScale = Math.min((containerWidth - 48) / baseVp.width, 1.8);
			}

			// Physical scale: multiply by DPR so canvas pixels match screen pixels
			const physicalScale = cssScale * dpr;

			const vp = page.getViewport({ scale: physicalScale });
			const canvas = canvasRef.current;

			// Canvas backing store = physical pixels
			canvas.width = vp.width;
			canvas.height = vp.height;
			// CSS size = logical pixels (browser scales down, looks sharp)
			canvas.style.width = `${vp.width / dpr}px`;
			canvas.style.height = `${vp.height / dpr}px`;

			const ctx = canvas.getContext('2d');
			const task = page.render({ canvasContext: ctx, viewport: vp });
			renderRef.current = task;
			task.promise.catch((e) => {
				if (e?.name !== 'RenderingCancelledException') console.error(e);
			});
		});

		return () => {
			cancelled = true;
			if (renderRef.current) {
				renderRef.current.cancel();
				renderRef.current = null;
			}
		};
	}, [pdfDoc, pageNum]);

	const isMobPage = typeof window !== 'undefined' && window.innerWidth <= 768;

	return (
		<div
			style={{
				display: 'flex',
				justifyContent: 'center',
				alignItems: isMobPage ? 'flex-start' : 'flex-start',
				padding: isMobPage ? '0' : '1.5rem 1.5rem 7rem',
				// On mobile the wrapper fills the full scroll area
				minHeight: isMobPage ? 'calc(100vh - 48px - 74px)' : 'auto',
			}}>
			<canvas
				ref={canvasRef}
				style={{
					display: 'block',
					maxWidth: '100%',
					boxShadow: isMobPage ? 'none' : '0 4px 32px rgba(26,18,8,0.13)',
					borderRadius: isMobPage ? 0 : 4,
				}}
			/>
		</div>
	);
}

// ─── Table of Contents Sidebar ────────────────────────────────────────────────
function TocSidebar({ chapters, currentPage, totalPages, onNavigate, onClose, isMobile }) {
	const activeRef = useRef(null);

	useEffect(() => {
		setTimeout(
			() => activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
			120,
		);
	}, [currentPage]);

	const activeIdx = chapters.reduce(
		(acc, ch, i) => (currentPage >= ch.page ? i : acc),
		0,
	);

	const inner = (
		<>
			{/* Handle (mobile only) */}
			<div className="sheet-handle" />

			{/* Header */}
			<div
				style={{
					padding: '0.9rem 1.1rem',
					borderBottom: '1px solid var(--paper-deep)',
					display: 'flex',
					alignItems: 'center',
					gap: '0.6rem',
					background: 'rgba(247,242,234,0.6)',
					flexShrink: 0,
				}}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
					<path d="M4 6h16M4 12h16M4 18h10" />
				</svg>
				<span style={{ flex: 1, fontFamily: "'Lora', serif", fontWeight: 700, fontSize: '0.9rem', color: 'var(--ink)' }}>
					Contents
				</span>
				<span style={{ fontSize: '0.65rem', color: 'var(--ink-faint)', background: 'var(--paper-mid)', borderRadius: 6, padding: '2px 7px', fontWeight: 600 }}>
					{chapters.length} chapters
				</span>
				<button
					onClick={onClose}
					style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--paper)', border: '1.5px solid var(--paper-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-faint)', fontSize: '0.8rem', cursor: 'pointer', flexShrink: 0 }}
					onMouseOver={(e) => { e.currentTarget.style.background = 'var(--ink)'; e.currentTarget.style.color = '#fff'; }}
					onMouseOut={(e) => { e.currentTarget.style.background = 'var(--paper)'; e.currentTarget.style.color = 'var(--ink-faint)'; }}>
					✕
				</button>
			</div>

			{/* Progress bar */}
			<div style={{ padding: '0.6rem 1.1rem 0.5rem', borderBottom: '1px solid var(--paper-deep)', flexShrink: 0 }}>
				<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
					<span style={{ fontSize: '0.62rem', color: 'var(--ink-faint)', fontWeight: 600 }}>PROGRESS</span>
					<span style={{ fontSize: '0.62rem', color: 'var(--amber)', fontWeight: 700 }}>
						{totalPages > 1 ? Math.round(((currentPage - 1) / (totalPages - 1)) * 100) : 100}%
					</span>
				</div>
				<div style={{ height: 3, background: 'var(--paper-deep)', borderRadius: 3 }}>
					<div style={{ height: '100%', borderRadius: 3, background: 'linear-gradient(90deg, var(--amber), var(--amber-glow))', width: `${totalPages > 1 ? ((currentPage - 1) / (totalPages - 1)) * 100 : 100}%`, transition: 'width 0.4s ease' }} />
				</div>
			</div>

			{/* Chapter list */}
			<div className="toc-scroll" style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0' }}>
				{chapters.length === 0 ? (
					<div style={{ padding: '2.5rem 1.5rem', textAlign: 'center' }}>
						<div style={{ fontSize: '1.8rem', marginBottom: '0.6rem' }}>📄</div>
						<p style={{ color: 'var(--ink-faint)', fontSize: '0.8rem', fontStyle: 'italic', lineHeight: 1.6 }}>
							No chapters found in this PDF's outline.
						</p>
					</div>
				) : (
					chapters.map((ch, i) => {
						const isActive = i === activeIdx;
						const isNested = ch.level > 1;
						return (
							<button
								key={i}
								ref={isActive ? activeRef : null}
								className="toc-item"
								onClick={() => { onNavigate(ch.page); onClose(); }}
								style={{
									width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
									paddingTop: '0.52rem', paddingBottom: '0.52rem', paddingRight: '1rem',
									paddingLeft: `${0.9 + (ch.level - 1) * 1.0}rem`,
									background: isActive ? 'linear-gradient(90deg, rgba(194,120,58,0.12), transparent)' : 'transparent',
									display: 'flex', alignItems: 'flex-start', gap: '0.55rem',
									borderLeft: isActive ? '3px solid var(--amber)' : '3px solid transparent',
								}}>
								{!isNested ? (
									<span style={{ flexShrink: 0, marginTop: '0.12rem', width: 18, height: 18, borderRadius: 5, background: isActive ? 'var(--amber)' : 'var(--paper-mid)', border: isActive ? 'none' : '1px solid var(--paper-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.55rem', fontWeight: 800, color: isActive ? '#fff' : 'var(--ink-faint)' }}>
										{i + 1}
									</span>
								) : (
									<span style={{ flexShrink: 0, width: 6, height: 6, borderRadius: '50%', background: isActive ? 'var(--amber)' : 'var(--paper-deep)', marginTop: '0.38rem' }} />
								)}
								<div style={{ flex: 1, minWidth: 0 }}>
									<p style={{ fontSize: isNested ? '0.76rem' : '0.82rem', fontWeight: isActive ? 700 : 500, color: isActive ? 'var(--amber)' : 'var(--ink-soft)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', fontFamily: isNested ? 'inherit' : "'Lora', serif" }}>
										{ch.title}
									</p>
									<p style={{ fontSize: '0.62rem', color: isActive ? 'var(--amber)' : 'var(--ink-faint)', marginTop: '0.1rem', fontWeight: isActive ? 600 : 400 }}>
										p. {ch.page}
									</p>
								</div>
							</button>
						);
					})
				)}
			</div>
		</>
	);

	if (isMobile) {
		return (
			<>
				<div className="sheet-backdrop" onClick={onClose} />
				<div className="side-sheet light-sheet bottom-sheet">
					{inner}
				</div>
			</>
		);
	}

	return (
		<div
			className="toc-sidebar sidebar-desktop"
			style={{ width: 272, flexShrink: 0, background: '#fff', borderRight: '1px solid var(--paper-deep)', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
			{inner}
		</div>
	);
}

// ─── End Room Confirm Dialog ──────────────────────────────────────────────────
function EndRoomDialog({ onConfirm, onCancel }) {
	return (
		<div style={{ position: 'fixed', inset: 0, background: 'rgba(26,18,8,0.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
			<div className="toast-pop" style={{ background: '#fff', borderRadius: 20, padding: '2rem', maxWidth: 360, width: '100%', boxShadow: '0 24px 64px rgba(26,18,8,0.25)', textAlign: 'center' }}>
				<div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📕</div>
				<h3 style={{ fontFamily: "'Lora', serif", fontSize: '1.2rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '0.5rem' }}>End this room?</h3>
				<p style={{ color: 'var(--ink-faint)', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
					This will permanently delete the room and the book for both readers. This cannot be undone.
				</p>
				<div style={{ display: 'flex', gap: '0.75rem' }}>
					<button onClick={onCancel} style={{ flex: 1, padding: '0.75rem', border: '1.5px solid var(--paper-deep)', borderRadius: 12, color: 'var(--ink-soft)', fontSize: '0.9rem', fontWeight: 600, background: 'none', cursor: 'pointer' }}>
						Cancel
					</button>
					<button onClick={onConfirm} style={{ flex: 1, padding: '0.75rem', background: 'linear-gradient(135deg, #c0392b, #e74c3c)', border: 'none', borderRadius: 12, color: '#fff', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 16px rgba(192,57,43,0.35)' }}>
						End Room
					</button>
				</div>
			</div>
		</div>
	);
}

// ─── Message Toast ────────────────────────────────────────────────────────────
function MessageToast({ msg, onDismiss, onOpen }) {
	useEffect(() => {
		const t = setTimeout(onDismiss, 4500);
		return () => clearTimeout(t);
	}, [onDismiss]);
	return (
		<div
			className="toast-pop"
			onClick={() => { onDismiss(); onOpen(); }}
			style={{ position: 'absolute', top: 'calc(100% + 12px)', right: 0, background: '#fff', borderRadius: 14, border: '1px solid var(--paper-deep)', boxShadow: '0 8px 32px rgba(26,18,8,0.14)', padding: '0.65rem 0.9rem', maxWidth: 265, display: 'flex', gap: '0.6rem', alignItems: 'flex-start', cursor: 'pointer', zIndex: 60 }}>
			<div style={{ width: 28, height: 28, borderRadius: '50%', background: msg.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.7rem', color: '#fff', flexShrink: 0 }}>
				{msg.name?.[0]?.toUpperCase()}
			</div>
			<div style={{ flex: 1, minWidth: 0 }}>
				<p style={{ fontSize: '0.7rem', fontWeight: 700, color: msg.color, marginBottom: '0.15rem' }}>{msg.name}</p>
				<p style={{ fontSize: '0.82rem', color: 'var(--ink)', lineHeight: 1.4, wordBreak: 'break-word' }}>{msg.text}</p>
			</div>
			<span style={{ color: 'var(--ink-faint)', fontSize: '0.65rem', flexShrink: 0, marginTop: 2, opacity: 0.6 }}>tap</span>
		</div>
	);
}

// ─── Desktop Floating Bar ──────────────────────────────────────────────────────
function FloatingBar({
	me, partner, partnerPage, currentPage, unreadCount,
	onOpenChat, onOpenToc, onOpenMusic,
	tocOpen, chatOpen, musicOpen,
	toast, onDismissToast, hasChapters, spotifyConnected, nowPlaying,
}) {
	const isSamePage = partnerPage === currentPage;

	return (
		<div
			className="desktop-float"
			style={{ position: 'fixed', top: 64, right: 18, zIndex: 50, flexDirection: 'column', alignItems: 'flex-end', gap: '0.45rem' }}>
			{isSamePage && (
				<div className="toast-pop" style={{ background: 'var(--ink)', color: 'var(--amber-glow)', borderRadius: 100, padding: '4px 12px', fontSize: '0.68rem', fontWeight: 600, whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(26,18,8,0.22)' }}>
					📖 Reading together
				</div>
			)}

			<div style={{ position: 'relative' }}>
				{toast && <MessageToast msg={toast} onDismiss={onDismissToast} onOpen={onOpenChat} />}

				<div style={{ background: 'rgba(247,242,234,0.96)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)', border: '1px solid var(--paper-deep)', borderRadius: 100, boxShadow: '0 8px 40px rgba(26,18,8,0.18)', padding: '0.45rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
					{hasChapters && (
						<>
							<button onClick={onOpenToc} title="Table of Contents"
								style={{ width: 36, height: 36, borderRadius: '50%', background: tocOpen ? 'linear-gradient(135deg, var(--amber), var(--amber-glow))' : 'var(--paper-mid)', border: tocOpen ? 'none' : '1.5px solid var(--paper-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.22s ease', flexShrink: 0 }}>
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={tocOpen ? '#fff' : 'var(--ink-soft)'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
									<path d="M4 6h16M4 12h16M4 18h10" />
								</svg>
							</button>
							<div style={{ width: 1, height: 20, background: 'var(--paper-deep)' }} />
						</>
					)}

					<div className="avatar-wrap" style={{ animation: 'floatBob 3.2s ease-in-out infinite' }}>
						<span className="avatar-tooltip">{me.name || 'You'}</span>
						<div style={{ width: 36, height: 36, borderRadius: '50%', background: me.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.9rem', color: '#fff', boxShadow: `0 0 0 2px rgba(247,242,234,1), 0 0 0 4px ${me.color}44`, cursor: 'default' }}>
							{me.name?.[0]?.toUpperCase()}
						</div>
						<div style={{ position: 'absolute', bottom: 1, right: 1, width: 9, height: 9, borderRadius: '50%', background: 'var(--sage)', border: '2px solid rgba(247,242,234,1)', boxShadow: '0 0 6px var(--sage)' }} />
					</div>

					<div style={{ width: 1, height: 20, background: 'var(--paper-deep)' }} />

					<div className="avatar-wrap" style={{ animation: 'floatBob 3.6s 0.4s ease-in-out infinite' }}>
						<span className="avatar-tooltip">{partner.name || 'Partner'} · p.{partnerPage + 1}</span>
						<div style={{ width: 36, height: 36, borderRadius: '50%', background: partner.color || '#999', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.9rem', color: '#fff', boxShadow: `0 0 0 2px rgba(247,242,234,1), 0 0 0 4px ${partner.color || '#999'}44`, cursor: 'default' }}>
							{(partner.name || '?')[0]?.toUpperCase()}
						</div>
						<div style={{ position: 'absolute', bottom: -10, left: '50%', transform: 'translateX(-50%)', background: 'var(--ink)', borderRadius: 8, padding: '1px 5px', fontSize: '0.5rem', color: 'var(--amber-glow)', fontWeight: 700, whiteSpace: 'nowrap', lineHeight: 1.6, zIndex: 2 }}>
							p.{partnerPage + 1}
						</div>
						<div style={{ position: 'absolute', bottom: 1, right: 1, width: 9, height: 9, borderRadius: '50%', background: 'var(--sage)', border: '2px solid rgba(247,242,234,1)' }}>
							<div style={{ position: 'absolute', inset: -1, borderRadius: '50%', background: 'var(--sage)', opacity: 0.4, animation: 'ripple 2.2s ease-out infinite' }} />
						</div>
					</div>

					<div style={{ width: 1, height: 20, background: 'var(--paper-deep)' }} />

					<button onClick={onOpenChat} style={{ width: 36, height: 36, borderRadius: '50%', background: chatOpen ? 'linear-gradient(135deg, var(--amber), var(--amber-glow))' : 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: chatOpen ? '0 4px 18px rgba(194,120,58,0.45)' : '0 4px 16px rgba(26,18,8,0.28)', transition: 'all 0.22s ease', border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
						</svg>
						{unreadCount > 0 && !chatOpen && (
							<div style={{ position: 'absolute', top: -3, right: -3, background: '#e05c4a', color: '#fff', width: 17, height: 17, borderRadius: '50%', fontSize: '0.58rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(247,242,234,1)', animation: 'bounce 1s ease-in-out infinite' }}>
								{unreadCount > 9 ? '9+' : unreadCount}
							</div>
						)}
					</button>

					<div style={{ width: 1, height: 20, background: 'var(--paper-deep)' }} />

					<button onClick={onOpenMusic} title="Music"
						style={{ width: 36, height: 36, borderRadius: '50%', background: musicOpen ? 'linear-gradient(135deg, #1DB954, #17a348)' : spotifyConnected ? '#1DB954' : 'var(--paper-mid)', border: musicOpen || spotifyConnected ? 'none' : '1.5px solid var(--paper-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.22s ease', flexShrink: 0, position: 'relative', boxShadow: spotifyConnected ? '0 4px 16px rgba(29,185,84,0.35)' : 'none' }}>
						<svg width="15" height="15" viewBox="0 0 24 24" fill={musicOpen || spotifyConnected ? '#fff' : 'var(--ink-soft)'}>
							<path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
						</svg>
						{spotifyConnected && nowPlaying && !musicOpen && (
							<div style={{ position: 'absolute', bottom: 3, right: 3, display: 'flex', gap: 1, alignItems: 'flex-end' }}>
								{[1, 2, 3].map((i) => (
									<div key={i} style={{ width: 2, borderRadius: 1, background: '#fff', height: `${4 + i * 2}px`, animation: `bounce ${0.4 + i * 0.15}s ${i * 0.1}s ease-in-out infinite` }} />
								))}
							</div>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}

// ─── Mobile Bottom Navigation Bar ─────────────────────────────────────────────
function MobileNavBar({
	me, partner, partnerPage, currentPage, unreadCount,
	onOpenChat, onOpenToc, onOpenMusic,
	tocOpen, chatOpen, musicOpen,
	toast, onDismissToast, hasChapters, spotifyConnected, nowPlaying,
	onPrev, onNext, totalPages,
}) {
	// currentPage prop is 0-based; totalPages is the real total
	const page1 = currentPage + 1; // 1-based for display & logic
	const isFirst = page1 <= 1;
	const isLast = totalPages > 0 && page1 >= totalPages;
	const isSamePage = partnerPage === currentPage;

	return (
		<div
			className="mobile-nav-bar"
			style={{
				position: 'fixed',
				bottom: 0,
				left: 0,
				right: 0,
				zIndex: 50,
				background: 'rgba(247,242,234,0.97)',
				backdropFilter: 'blur(20px)',
				WebkitBackdropFilter: 'blur(20px)',
				borderTop: '1px solid var(--paper-deep)',
				paddingBottom: 'env(safe-area-inset-bottom, 0px)',
			}}>
			{/* Toast above bar */}
			{toast && (
				<div style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 8, width: '90vw', maxWidth: 340 }}>
					<MessageToast msg={toast} onDismiss={onDismissToast} onOpen={onOpenChat} />
				</div>
			)}

			{/* "Reading together" pill — floats above bar, never affects layout */}
			{isSamePage && (
				<div style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 6, pointerEvents: 'none' }}>
					<span className="toast-pop" style={{ display: 'inline-block', background: 'var(--ink)', color: 'var(--amber-glow)', borderRadius: 100, padding: '3px 12px', fontSize: '0.62rem', fontWeight: 600, whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(26,18,8,0.18)' }}>
						📖 Reading together
					</span>
				</div>
			)}

			{/* Main bar row */}
			<div style={{ display: 'flex', alignItems: 'center', padding: '0.45rem 0.75rem', gap: '0.3rem' }}>
				{/* Prev page */}
				<button
					className="page-btn"
					onClick={onPrev}
					disabled={isFirst}
					style={{ width: 44, height: 44, borderRadius: '50%', border: `1.5px solid ${isFirst ? 'var(--paper-deep)' : 'var(--ink)'}`, background: isFirst ? 'transparent' : 'var(--ink)', color: isFirst ? 'var(--paper-deep)' : '#fff', fontSize: '1.3rem', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isFirst ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
					‹
				</button>

				{/* Centre section: page counter + action buttons */}
				<div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.55rem' }}>

					{/* Page counter — most important, shown prominently */}
					<div style={{ display: 'flex', alignItems: 'baseline', gap: '3px', background: 'var(--paper-mid)', border: '1.5px solid var(--paper-deep)', borderRadius: 10, padding: '4px 10px', flexShrink: 0 }}>
						<span style={{ fontFamily: "'Lora', serif", fontWeight: 800, fontSize: '1rem', color: 'var(--ink)', lineHeight: 1 }}>
							{page1}
						</span>
						<span style={{ fontSize: '0.65rem', color: 'var(--ink-faint)', fontWeight: 500 }}>
							/{totalPages || '…'}
						</span>
					</div>

					{/* Divider */}
					<div style={{ width: 1, height: 22, background: 'var(--paper-deep)', flexShrink: 0 }} />

					{/* Avatars */}
					<div style={{ position: 'relative', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
						<div style={{ width: 28, height: 28, borderRadius: '50%', background: me.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.7rem', color: '#fff', border: '2px solid rgba(247,242,234,1)', zIndex: 2 }}>
							{me.name?.[0]?.toUpperCase()}
						</div>
						<div style={{ width: 28, height: 28, borderRadius: '50%', background: partner.color || '#999', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.7rem', color: '#fff', border: '2px solid rgba(247,242,234,1)', marginLeft: -7, position: 'relative' }}>
							{(partner.name || '?')[0]?.toUpperCase()}
							<div style={{ position: 'absolute', bottom: 0, right: 0, width: 7, height: 7, borderRadius: '50%', background: 'var(--sage)', border: '1.5px solid rgba(247,242,234,1)' }} />
						</div>
					</div>

					{/* Divider */}
					<div style={{ width: 1, height: 22, background: 'var(--paper-deep)', flexShrink: 0 }} />

					{/* TOC */}
					{hasChapters && (
						<button onClick={onOpenToc}
							style={{ width: 36, height: 36, borderRadius: '50%', background: tocOpen ? 'linear-gradient(135deg, var(--amber), var(--amber-glow))' : 'var(--paper-mid)', border: tocOpen ? 'none' : '1.5px solid var(--paper-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
							<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={tocOpen ? '#fff' : 'var(--ink-soft)'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
								<path d="M4 6h16M4 12h16M4 18h10" />
							</svg>
						</button>
					)}

					{/* Chat */}
					<button onClick={onOpenChat}
						style={{ width: 36, height: 36, borderRadius: '50%', background: chatOpen ? 'linear-gradient(135deg, var(--amber), var(--amber-glow))' : 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0, boxShadow: chatOpen ? '0 4px 18px rgba(194,120,58,0.4)' : '0 2px 8px rgba(26,18,8,0.2)' }}>
						<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
						</svg>
						{unreadCount > 0 && !chatOpen && (
							<div style={{ position: 'absolute', top: -2, right: -2, background: '#e05c4a', color: '#fff', width: 16, height: 16, borderRadius: '50%', fontSize: '0.55rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(247,242,234,1)', animation: 'bounce 1s ease-in-out infinite' }}>
								{unreadCount > 9 ? '9+' : unreadCount}
							</div>
						)}
					</button>

					{/* Music */}
					<button onClick={onOpenMusic}
						style={{ width: 36, height: 36, borderRadius: '50%', background: musicOpen ? 'linear-gradient(135deg, #1DB954, #17a348)' : spotifyConnected ? '#1DB954' : 'var(--paper-mid)', border: musicOpen || spotifyConnected ? 'none' : '1.5px solid var(--paper-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, boxShadow: spotifyConnected ? '0 4px 16px rgba(29,185,84,0.35)' : 'none' }}>
						<svg width="13" height="13" viewBox="0 0 24 24" fill={musicOpen || spotifyConnected ? '#fff' : 'var(--ink-soft)'}>
							<path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
						</svg>
					</button>
				</div>

				{/* Next page */}
				<button
					className="page-btn"
					onClick={onNext}
					disabled={isLast}
					style={{ width: 44, height: 44, borderRadius: '50%', border: `1.5px solid ${isLast ? 'var(--paper-deep)' : 'var(--ink)'}`, background: isLast ? 'transparent' : 'var(--ink)', color: isLast ? 'var(--paper-deep)' : '#fff', fontSize: '1.3rem', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isLast ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
					›
				</button>
			</div>
		</div>
	);
}

// ─── Emoji Picker ─────────────────────────────────────────────────────────────
const EMOJI_CATEGORIES = [
	{ label: '😊', title: 'Smileys', emojis: ['😀','😂','😍','🥰','😊','😎','🤩','😭','😅','🤔','😬','🙄','😴','🥹','😇','🤣','😆','😋','😛','🥲','🫠','😤','😩','😢','😡','🤯','🥳','😏','🫡','😐'] },
	{ label: '📚', title: 'Books & Reading', emojis: ['📚','📖','📝','✏️','🖊️','🖋️','📓','📔','📒','📕','📗','📘','📙','🗒️','📄','📃','📑','🔖','🏷️','💡','🧠','👓','🔍','✨','💬','💭','🗨️','💯','⭐','🌟'] },
	{ label: '👍', title: 'Gestures', emojis: ['👍','👎','👏','🙌','🤝','🫶','❤️','💔','💕','💞','💖','💗','💓','💘','💝','🔥','✅','❌','⚡','🎉','🎊','🎯','💪','🫂','👀','🤦','🤷','💀','🫣','😮'] },
	{ label: '🌙', title: 'Nature & Time', emojis: ['🌙','☀️','⭐','🌟','✨','🌈','☁️','🌧️','❄️','🍂','🍃','🌸','🌺','🌻','🍀','🌿','🪴','🌱','🌊','🏔️','🌅','🌄','🕐','⏰','📅','🗓️','⌛','⏳','🔮','🪄'] },
	{ label: '🎭', title: 'Fun & Reactions', emojis: ['💀','😭','💅','👻','🤡','🫠','🥴','🤢','😵','🤮','🫥','😶','🤫','🧐','🤓','👽','🤖','💩','🫶','🙏','🤞','✌️','🤟','🤙','👈','👉','👆','👇','☝️','✋'] },
];

function EmojiPicker({ onSelect, onClose }) {
	const [activeTab, setActiveTab] = useState(0);
	const ref = useRef();

	useEffect(() => {
		const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
		setTimeout(() => document.addEventListener('mousedown', handler), 0);
		return () => document.removeEventListener('mousedown', handler);
	}, [onClose]);

	return (
		<div ref={ref} className="toast-pop" style={{ position: 'absolute', bottom: 'calc(100% + 8px)', right: 0, width: 272, background: '#fff', border: '1px solid var(--paper-deep)', borderRadius: 16, boxShadow: '0 12px 40px rgba(26,18,8,0.18)', overflow: 'hidden', zIndex: 80 }}>
			<div style={{ display: 'flex', borderBottom: '1px solid var(--paper-deep)', background: 'rgba(247,242,234,0.7)' }}>
				{EMOJI_CATEGORIES.map((cat, i) => (
					<button key={i} onClick={() => setActiveTab(i)} title={cat.title}
						style={{ flex: 1, height: 36, fontSize: '0.95rem', background: 'none', border: 'none', cursor: 'pointer', borderBottom: activeTab === i ? '2px solid var(--amber)' : '2px solid transparent', transition: 'all 0.15s', opacity: activeTab === i ? 1 : 0.5 }}>
						{cat.label}
					</button>
				))}
			</div>
			<div style={{ padding: '0.4rem', display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 2, maxHeight: 180, overflowY: 'auto' }}>
				{EMOJI_CATEGORIES[activeTab].emojis.map((emoji, i) => (
					<button key={i} onClick={() => onSelect(emoji)}
						style={{ fontSize: '1.15rem', padding: '0.28rem', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 8, lineHeight: 1, transition: 'background 0.1s' }}
						onMouseOver={(e) => (e.currentTarget.style.background = 'var(--paper-mid)')}
						onMouseOut={(e) => (e.currentTarget.style.background = 'none')}>
						{emoji}
					</button>
				))}
			</div>
		</div>
	);
}

// ─── Chat Sidebar ─────────────────────────────────────────────────────────────
function ChatSidebar({ messages, partner, currentPage, onSend, onClose, isMobile }) {
	const [text, setText] = useState('');
	const [emojiOpen, setEmojiOpen] = useState(false);
	const endRef = useRef();
	const inputRef = useRef();

	useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
	useEffect(() => { setTimeout(() => inputRef.current?.focus(), 80); }, []);

	const send = () => {
		if (!text.trim()) return;
		onSend(text.trim());
		setText('');
		setEmojiOpen(false);
		inputRef.current?.focus();
	};

	const insertEmoji = (emoji) => {
		const el = inputRef.current;
		if (!el) { setText((t) => t + emoji); return; }
		const start = el.selectionStart ?? text.length;
		const end = el.selectionEnd ?? text.length;
		const next = text.slice(0, start) + emoji + text.slice(end);
		setText(next);
		requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + emoji.length, start + emoji.length); });
	};

	const inner = (
		<>
			{isMobile && <div className="sheet-handle" />}
			{/* Header */}
			<div style={{ padding: '0.9rem 1.1rem', borderBottom: '1px solid var(--paper-deep)', display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0, background: 'rgba(247,242,234,0.6)' }}>
				<div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
					<div style={{ width: 32, height: 32, borderRadius: '50%', background: partner.color || '#999', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem', color: '#fff' }}>
						{(partner.name || '?')[0]?.toUpperCase()}
					</div>
					<div>
						<p style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--ink)', lineHeight: 1.2 }}>{partner.name || 'Partner'}</p>
						<p style={{ fontSize: '0.64rem', color: 'var(--sage)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
							<span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--sage)', display: 'inline-block', animation: 'pulse 2s ease-in-out infinite' }} />
							Online · Page {(partner.page ?? 0) + 1}
						</p>
					</div>
				</div>
				<button onClick={onClose}
					style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--paper)', border: '1.5px solid var(--paper-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-faint)', fontSize: '0.85rem', cursor: 'pointer' }}
					onMouseOver={(e) => { e.currentTarget.style.background = 'var(--ink)'; e.currentTarget.style.color = '#fff'; }}
					onMouseOut={(e) => { e.currentTarget.style.background = 'var(--paper)'; e.currentTarget.style.color = 'var(--ink-faint)'; }}>
					✕
				</button>
			</div>

			{/* Messages */}
			<div className="chat-scroll" style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
				{messages.length === 0 && (
					<div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
						<div style={{ fontSize: '2rem', marginBottom: '0.75rem', animation: 'floatBob 3s ease-in-out infinite' }}>✍️</div>
						<p style={{ color: 'var(--ink-faint)', fontSize: '0.82rem', fontStyle: 'italic', fontFamily: "'Crimson Pro', serif", lineHeight: 1.6 }}>Start the conversation…</p>
					</div>
				)}
				{messages.map((msg) => {
					const isMe = msg.userId !== partner.userId;
					return (
						<div key={msg.id} className="msg-bubble" style={{ display: 'flex', gap: '0.4rem', flexDirection: isMe ? 'row-reverse' : 'row', alignItems: 'flex-end' }}>
							{!isMe && (
								<div style={{ width: 24, height: 24, borderRadius: '50%', background: msg.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.6rem', color: '#fff', flexShrink: 0 }}>
									{msg.name?.[0]?.toUpperCase()}
								</div>
							)}
							<div style={{ maxWidth: '76%', display: 'flex', flexDirection: 'column', gap: 3, alignItems: isMe ? 'flex-end' : 'flex-start' }}>
								<div style={{ padding: '0.5rem 0.85rem', background: isMe ? 'linear-gradient(135deg, var(--amber) 0%, var(--amber-glow) 100%)' : 'var(--paper)', borderRadius: isMe ? '14px 14px 3px 14px' : '14px 14px 14px 3px', color: isMe ? '#fff' : 'var(--ink)', fontSize: '0.9rem', lineHeight: 1.5, border: isMe ? 'none' : '1px solid var(--paper-deep)', wordBreak: 'break-word' }}>
									{msg.text}
								</div>
								<div style={{ display: 'flex', gap: '0.3rem', paddingInline: '0.2rem' }}>
									<span style={{ color: 'var(--ink-faint)', fontSize: '0.6rem' }}>{timeAgo(msg.ts)}</span>
									<span style={{ color: 'var(--paper-deep)', fontSize: '0.6rem', background: 'var(--paper-mid)', borderRadius: 3, padding: '0 4px' }}>p.{msg.page + 1}</span>
								</div>
							</div>
						</div>
					);
				})}
				<div ref={endRef} />
			</div>

			{/* Input */}
			<div style={{ padding: '0.75rem', borderTop: '1px solid var(--paper-deep)', flexShrink: 0 }}>
				<div
					style={{ position: 'relative', display: 'flex', gap: '0.4rem', alignItems: 'flex-end', background: 'var(--paper)', border: '1.5px solid var(--paper-deep)', borderRadius: 14, padding: '0.45rem 0.45rem 0.45rem 0.85rem', transition: 'border-color 0.2s' }}
					onFocusCapture={(e) => (e.currentTarget.style.borderColor = 'var(--amber)')}
					onBlurCapture={(e) => { if (!emojiOpen) e.currentTarget.style.borderColor = 'var(--paper-deep)'; }}>
					<textarea
						ref={inputRef}
						value={text}
						onChange={(e) => setText(e.target.value)}
						onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
						placeholder={`Message ${partner.name || 'partner'}…`}
						rows={1}
						style={{ flex: 1, background: 'transparent', resize: 'none', color: 'var(--ink)', fontSize: '0.875rem', lineHeight: 1.5, fontFamily: "'Lora', serif", maxHeight: 100, overflowY: 'auto', outline: 'none', border: 'none' }}
					/>
					<div style={{ position: 'relative', flexShrink: 0 }}>
						{emojiOpen && <EmojiPicker onSelect={insertEmoji} onClose={() => setEmojiOpen(false)} />}
						<button onClick={() => setEmojiOpen((v) => !v)} title="Emoji"
							style={{ width: 30, height: 30, borderRadius: 9, border: 'none', background: emojiOpen ? 'var(--paper-deep)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '1rem', transition: 'background 0.15s' }}>
							😊
						</button>
					</div>
					<button onClick={send} disabled={!text.trim()}
						style={{ width: 32, height: 32, borderRadius: 10, border: 'none', flexShrink: 0, background: text.trim() ? 'linear-gradient(135deg, var(--amber), var(--amber-glow))' : 'var(--paper-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.18s', cursor: text.trim() ? 'pointer' : 'not-allowed' }}>
						<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={text.trim() ? '#fff' : 'var(--ink-faint)'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'rotate(90deg)' }}>
							<path d="M12 19V5M5 12l7-7 7 7" />
						</svg>
					</button>
				</div>
				<p style={{ color: 'var(--ink-faint)', fontSize: '0.62rem', textAlign: 'center', marginTop: '0.3rem' }}>Enter to send · Shift+Enter for new line</p>
			</div>
		</>
	);

	if (isMobile) {
		return (
			<>
				<div className="sheet-backdrop" onClick={onClose} />
				<div className="side-sheet light-sheet bottom-sheet" style={{ maxHeight: '85vh' }}>
					{inner}
				</div>
			</>
		);
	}

	return (
		<div className="chat-sidebar sidebar-desktop" style={{ width: 310, flexShrink: 0, background: '#fff', borderLeft: '1px solid var(--paper-deep)', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
			{inner}
		</div>
	);
}

// ─── Spotify Logo ─────────────────────────────────────────────────────────────
function SpotifyLogo({ size = 24, color = 'currentColor' }) {
	return (
		<svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
			<path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
		</svg>
	);
}

// ─── PKCE helpers ─────────────────────────────────────────────────────────────
function _b64url(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''); }
async function _challenge(v) { return _b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))); }
function _rand(n) { const ch = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; return Array.from(crypto.getRandomValues(new Uint8Array(n))).map((b) => ch[b % ch.length]).join(''); }

const SP_SCOPES = ['user-read-currently-playing','user-read-playback-state','user-modify-playback-state','user-read-recently-played'].join(' ');

// ─── useSpotifyPlayer ─────────────────────────────────────────────────────────
function useSpotifyPlayer({ roomId, clientId, redirectUri, onTrackChange }) {
	const [token, setToken] = useState(() => sessionStorage.getItem('sp_np_token') || null);
	const [nowPlaying, setNowPlaying] = useState(null);
	const [error, setError] = useState(null);
	const [controlling, setControlling] = useState(false);
	const lastUriRef = useRef(null);
	const pollRef = useRef(null);

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const code = params.get('code');
		const state = params.get('state');
		const verifier = sessionStorage.getItem('sp_np_verifier');
		if (!code || !verifier || state !== 'sp_np') return;
		window.history.replaceState({}, '', window.location.pathname);
		const cid = sessionStorage.getItem('sp_np_client_id') || clientId;
		const red = sessionStorage.getItem('sp_np_redirect') || redirectUri;
		fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: cid, grant_type: 'authorization_code', code, redirect_uri: red, code_verifier: verifier }) })
			.then((r) => r.json())
			.then((d) => {
				if (d.access_token) { sessionStorage.setItem('sp_np_token', d.access_token); if (d.refresh_token) sessionStorage.setItem('sp_np_refresh', d.refresh_token); setToken(d.access_token); setError(null); }
				else { setError(d.error_description || d.error || 'Auth failed'); }
				sessionStorage.removeItem('sp_np_verifier');
			}).catch((e) => setError(e.message));
	}, [clientId, redirectUri]);

	const refresh = useCallback(async () => {
		const rt = sessionStorage.getItem('sp_np_refresh');
		const cid = sessionStorage.getItem('sp_np_client_id') || clientId;
		if (!rt) return null;
		const d = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt, client_id: cid }) }).then((r) => r.json());
		if (d.access_token) { sessionStorage.setItem('sp_np_token', d.access_token); setToken(d.access_token); return d.access_token; }
		return null;
	}, [clientId]);

	useEffect(() => {
		if (!token) return;
		const fetchState = async (tk) => {
			try {
				const res = await fetch('https://api.spotify.com/v1/me/player', { headers: { Authorization: `Bearer ${tk}` } });
				if (res.status === 204) { setNowPlaying(null); return; }
				if (res.status === 401) { const nt = await refresh(); if (nt) fetchState(nt); return; }
				if (!res.ok) return;
				const data = await res.json();
				if (!data?.item) { setNowPlaying(null); return; }
				const track = { uri: data.item.uri, name: data.item.name, artist: data.item.artists?.map((a) => a.name).join(', ') || '', albumArt: data.item.album?.images?.[0]?.url || '', albumName: data.item.album?.name || '', isPlaying: data.is_playing, progressMs: data.progress_ms || 0, durationMs: data.item.duration_ms || 0, contextUri: data.context?.uri || null, embedUri: data.context?.uri || data.item.uri };
				setNowPlaying(track);
				if (track.uri !== lastUriRef.current) { lastUriRef.current = track.uri; onTrackChange?.(track); }
			} catch (e) { console.warn('Spotify poll:', e); }
		};
		fetchState(token);
		pollRef.current = setInterval(() => fetchState(token), 5000);
		return () => clearInterval(pollRef.current);
	}, [token, refresh]);

	const apiCall = useCallback(async (endpoint, method = 'POST', body = null) => {
		if (!token) return;
		setControlling(true);
		try {
			const opts = { method, headers: { Authorization: `Bearer ${token}` } };
			if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
			const res = await fetch(`https://api.spotify.com/v1/me/player/${endpoint}`, opts);
			if (res.status === 401) { const nt = await refresh(); if (nt) apiCall(endpoint, method, body); }
			setTimeout(() => {
				if (!token) return;
				fetch('https://api.spotify.com/v1/me/player', { headers: { Authorization: `Bearer ${token}` } })
					.then((r) => (r.status === 204 ? null : r.json()))
					.then((data) => {
						if (!data?.item) return;
						const track = { uri: data.item.uri, name: data.item.name, artist: data.item.artists?.map((a) => a.name).join(', ') || '', albumArt: data.item.album?.images?.[0]?.url || '', albumName: data.item.album?.name || '', isPlaying: data.is_playing, progressMs: data.progress_ms || 0, durationMs: data.item.duration_ms || 0, contextUri: data.context?.uri || null, embedUri: data.context?.uri || data.item.uri };
						setNowPlaying(track);
						if (track.uri !== lastUriRef.current) { lastUriRef.current = track.uri; onTrackChange?.(track); } else { onTrackChange?.(track); }
					}).catch(() => {});
			}, 600);
		} catch (e) { console.error('Spotify control:', e); } finally { setControlling(false); }
	}, [token, refresh]);

	const play = useCallback(() => apiCall('play', 'PUT'), [apiCall]);
	const pause = useCallback(() => apiCall('pause', 'PUT'), [apiCall]);
	const next = useCallback(() => apiCall('next', 'POST'), [apiCall]);
	const prev = useCallback(() => apiCall('previous', 'POST'), [apiCall]);
	const seek = useCallback((ms) => apiCall(`seek?position_ms=${ms}`, 'PUT'), [apiCall]);
	const setVol = useCallback((pct) => apiCall(`volume?volume_percent=${Math.round(pct * 100)}`, 'PUT'), [apiCall]);

	const login = useCallback(async () => {
		const verifier = _rand(64);
		const challenge = await _challenge(verifier);
		sessionStorage.setItem('sp_np_verifier', verifier);
		sessionStorage.setItem('sp_np_client_id', clientId);
		sessionStorage.setItem('sp_np_redirect', redirectUri);
		window.location.href = `https://accounts.spotify.com/authorize?` + new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirectUri, scope: SP_SCOPES, code_challenge_method: 'S256', code_challenge: challenge, state: 'sp_np' });
	}, [clientId, redirectUri]);

	const logout = useCallback(() => {
		['sp_np_token', 'sp_np_refresh'].forEach((k) => sessionStorage.removeItem(k));
		setToken(null); setNowPlaying(null); lastUriRef.current = null; clearInterval(pollRef.current);
	}, []);

	return { token, nowPlaying, error, controlling, login, logout, play, pause, next, prev, seek, setVol };
}

// ─── Music Sidebar ────────────────────────────────────────────────────────────
function MusicSidebar({ roomId, syncedTrack, onTrackChange, onClose, isMobile }) {
	const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID || '';
	const redirectUri = import.meta.env.VITE_SPOTIFY_REDIRECT || window.location.origin + '/';
	const sp = useSpotifyPlayer({ roomId, clientId, redirectUri, onTrackChange });
	const [volume, setVolumeLocal] = useState(0.7);
	const [seeking, setSeeking] = useState(false);
	const [seekVal, setSeekVal] = useState(0);

	const display = sp.nowPlaying || syncedTrack;
	const isLocal = !!sp.nowPlaying;

	const fmtTime = (ms) => { if (!ms || ms < 0) return '0:00'; const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
	const progressPct = display?.durationMs ? Math.min(100, ((seeking ? seekVal : display.progressMs) / display.durationMs) * 100) : 0;
	const toEmbed = (track) => { const uri = track?.contextUri || track?.uri || track?.embedUri; if (!uri) return null; const p = uri.split(':'); return p.length >= 3 ? `https://open.spotify.com/embed/${p[1]}/${p[2]}?utm_source=generator&theme=0` : null; };
	const embedUrl = toEmbed(syncedTrack || sp.nowPlaying);
	const handleVolume = (v) => { setVolumeLocal(v); sp.setVol(v); };

	const wrapStyle = {
		background: '#0d0d0d',
		display: 'flex',
		flexDirection: 'column',
		overflow: 'hidden',
		position: 'relative',
	};

	const inner = (
		<>
			{isMobile && <div className="sheet-handle" style={{ background: '#333' }} />}

			{/* Blurred backdrop */}
			{display?.albumArt && (
				<div style={{ position: 'absolute', inset: 0, zIndex: 0, backgroundImage: `url(${display.albumArt})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(60px) brightness(0.18) saturate(1.8)', transform: 'scale(1.15)', pointerEvents: 'none' }} />
			)}

			{/* Header */}
			<div style={{ position: 'relative', zIndex: 2, padding: '0.9rem 1rem', display: 'flex', alignItems: 'center', gap: '0.65rem', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(13,13,13,0.55)', backdropFilter: 'blur(20px)', flexShrink: 0 }}>
				<SpotifyLogo size="18" color="#1DB954" />
				<span style={{ flex: 1, color: '#fff', fontFamily: "'Lora',serif", fontWeight: 700, fontSize: '0.92rem' }}>Music</span>
				{sp.token && (
					<button onClick={sp.logout} style={{ fontSize: '0.61rem', color: '#666', background: 'transparent', border: '1px solid #2e2e2e', borderRadius: 6, padding: '2px 9px', cursor: 'pointer', letterSpacing: '0.04em', transition: 'all 0.15s' }}
						onMouseOver={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#555'; }}
						onMouseOut={(e) => { e.currentTarget.style.color = '#666'; e.currentTarget.style.borderColor = '#2e2e2e'; }}>
						Disconnect
					</button>
				)}
				<button onClick={onClose} className="sp-btn" style={{ width: 30, height: 30, color: '#777', background: 'rgba(255,255,255,0.07)', borderRadius: '50%', fontSize: '0.82rem' }}>✕</button>
			</div>

			{!sp.token ? (
				/* Not connected */
				<div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 1.75rem', gap: '1.5rem', textAlign: 'center', overflowY: 'auto' }}>
					<div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg,#1DB954 0%,#0f7a35 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 0 rgba(29,185,84,0.4)', animation: 'spPulse 2.4s ease-in-out infinite', flexShrink: 0 }}>
						<SpotifyLogo size="40" color="#fff" />
					</div>
					<div style={{ maxWidth: 280 }}>
						<p style={{ color: '#fff', fontFamily: "'Lora',serif", fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.6rem', lineHeight: 1.3 }}>Listen Together</p>
						<p style={{ color: '#a0a0a0', fontSize: '0.82rem', lineHeight: 1.75 }}>Connect Spotify once. Play anything on your phone, laptop, or any device — it syncs live to your reading partner.</p>
					</div>
					{!clientId && (
						<div style={{ width: '100%', background: 'rgba(224,92,74,0.1)', border: '1px solid rgba(224,92,74,0.25)', borderRadius: 10, padding: '0.65rem 0.9rem' }}>
							<p style={{ color: '#e05c4a', fontSize: '0.73rem', fontWeight: 600 }}>⚠ VITE_SPOTIFY_CLIENT_ID not set in .env</p>
						</div>
					)}
					{sp.error && (
						<div style={{ width: '100%', background: 'rgba(224,92,74,0.1)', border: '1px solid rgba(224,92,74,0.25)', borderRadius: 10, padding: '0.65rem 0.9rem' }}>
							<p style={{ color: '#e05c4a', fontSize: '0.73rem' }}>⚠ {sp.error}</p>
						</div>
					)}
					<button onClick={sp.login} disabled={!clientId}
						style={{ background: clientId ? '#1DB954' : '#2a2a2a', color: '#fff', border: 'none', borderRadius: 100, padding: '0.85rem 2.5rem', fontWeight: 800, fontSize: '0.92rem', cursor: clientId ? 'pointer' : 'not-allowed', boxShadow: clientId ? '0 4px 24px rgba(29,185,84,0.45)' : 'none', fontFamily: "'Lora',serif", letterSpacing: '0.03em', transition: 'all 0.18s' }}>
						Connect with Spotify
					</button>
					{syncedTrack && (
						<div style={{ width: '100%', background: '#181818', border: '1px solid #2a2a2a', borderRadius: 14, padding: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
							{syncedTrack.albumArt && <img src={syncedTrack.albumArt} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0, boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }} />}
							<div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
								<p style={{ color: '#999', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 3 }}>PARTNER IS LISTENING TO</p>
								<p style={{ color: '#fff', fontWeight: 700, fontSize: '0.83rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{syncedTrack.name}</p>
								<p style={{ color: '#777', fontSize: '0.71rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{syncedTrack.artist}</p>
							</div>
						</div>
					)}
				</div>
			) : display ? (
				/* Connected + playing */
				<div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
					<div style={{ padding: '1.5rem 1.5rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
						<div style={{ position: 'relative' }}>
							<div style={{ width: isMobile ? 140 : 180, height: isMobile ? 140 : 180, borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)', transition: 'transform 0.3s', transform: display.isPlaying ? 'scale(1)' : 'scale(0.94)' }}>
								{display.albumArt ? <img src={display.albumArt} alt="Album art" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', background: '#1f1f1f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem' }}>🎵</div>}
							</div>
							{isLocal && display.isPlaying && (
								<div style={{ position: 'absolute', bottom: 10, right: 10, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', borderRadius: 20, padding: '3px 9px', display: 'flex', alignItems: 'center', gap: 5 }}>
									{[1,2,3].map((i) => <span key={i} className="eq-bar" style={{ height: `${4+i*3}px`, animationDelay: `${i*0.14}s` }} />)}
								</div>
							)}
						</div>
						<div style={{ textAlign: 'center', width: '100%' }}>
							<p style={{ color: '#fff', fontWeight: 800, fontSize: '1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '0.2rem' }}>{display.name}</p>
							<p style={{ color: '#a0a0a0', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{display.artist}</p>
							{!isLocal && <span style={{ display: 'inline-block', marginTop: '0.35rem', fontSize: '0.62rem', color: '#1DB954', fontWeight: 700, letterSpacing: '0.07em', background: 'rgba(29,185,84,0.12)', borderRadius: 20, padding: '2px 10px' }}>PARTNER'S MUSIC</span>}
						</div>
					</div>

					<div style={{ padding: '0 1.25rem 0.75rem', flexShrink: 0 }}>
						{/* Seek bar */}
						<div style={{ marginBottom: '0.85rem' }}>
							<div style={{ position: 'relative', height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.12)', marginBottom: '0.3rem', cursor: isLocal ? 'pointer' : 'default' }}>
								<div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${progressPct}%`, background: '#1DB954', borderRadius: 4, transition: seeking ? 'none' : 'width 1s linear', pointerEvents: 'none' }} />
								<input type="range" min={0} max={display.durationMs || 100} value={seeking ? seekVal : display.progressMs || 0} onChange={(e) => { if (!isLocal) return; setSeeking(true); setSeekVal(Number(e.target.value)); }} onMouseUp={(e) => { if (!isLocal) return; setSeeking(false); sp.seek(Number(e.target.value)); }} onTouchEnd={(e) => { if (!isLocal) return; setSeeking(false); sp.seek(Number(e.target.value)); }} disabled={!isLocal} className="sp-track-range" style={{ position: 'absolute', inset: 0, width: '100%', margin: 0, opacity: 0, cursor: isLocal ? 'pointer' : 'default' }} />
							</div>
							<div style={{ display: 'flex', justifyContent: 'space-between' }}>
								<span style={{ color: '#666', fontSize: '0.63rem' }}>{fmtTime(seeking ? seekVal : display.progressMs)}</span>
								<span style={{ color: '#666', fontSize: '0.63rem' }}>{fmtTime(display.durationMs)}</span>
							</div>
						</div>

						{/* Controls */}
						<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.65rem', marginBottom: '0.85rem' }}>
							<button onClick={sp.prev} disabled={!isLocal || sp.controlling} className="sp-btn" style={{ width: 40, height: 40, color: isLocal ? '#fff' : '#3a3a3a' }}>
								<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
							</button>
							<button onClick={display.isPlaying ? sp.pause : sp.play} disabled={!isLocal || sp.controlling} className="sp-btn" style={{ width: 58, height: 58, borderRadius: '50%', background: isLocal ? '#1DB954' : '#2a2a2a', color: '#fff', boxShadow: isLocal ? '0 4px 28px rgba(29,185,84,0.55)' : 'none' }}>
								{sp.controlling ? <div style={{ width: 16, height: 16, border: '2.5px solid rgba(255,255,255,0.25)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spSpin 0.7s linear infinite' }} /> : display.isPlaying ? <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg> : <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 3 }}><polygon points="5 3 19 12 5 21 5 3" /></svg>}
							</button>
							<button onClick={sp.next} disabled={!isLocal || sp.controlling} className="sp-btn" style={{ width: 40, height: 40, color: isLocal ? '#fff' : '#3a3a3a' }}>
								<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
							</button>
						</div>

						{/* Volume */}
						<div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={volume === 0 ? '#666' : '#a0a0a0'} strokeWidth="2" strokeLinecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />{volume > 0 && <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />}{volume > 0.5 && <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />}</svg>
							<div style={{ flex: 1, position: 'relative', height: 3, borderRadius: 3, background: 'rgba(255,255,255,0.1)' }}>
								<div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${volume * 100}%`, background: '#a0a0a0', borderRadius: 3, pointerEvents: 'none' }} />
								<input type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => handleVolume(parseFloat(e.target.value))} className="sp-vol-range" style={{ position: 'absolute', inset: 0, width: '100%', margin: 0, opacity: 0, cursor: 'pointer' }} />
							</div>
						</div>
					</div>

					{embedUrl && !isMobile && (
						<div style={{ flex: 1, minHeight: 0, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
							<iframe src={embedUrl} width="100%" height="100%" frameBorder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" style={{ border: 'none', display: 'block' }} />
						</div>
					)}
				</div>
			) : (
				/* Connected, nothing playing */
				<div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.25rem', padding: '2.5rem 2rem', textAlign: 'center' }}>
					<div style={{ width: 64, height: 64, borderRadius: '50%', background: '#1a1a1a', border: '1px solid #2a2a2a', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'floatBob 3.5s ease-in-out infinite' }}>
						<SpotifyLogo size="32" color="#333" />
					</div>
					<div>
						<p style={{ color: '#fff', fontFamily: "'Lora',serif", fontWeight: 700, fontSize: '1rem', marginBottom: '0.45rem' }}>Nothing playing yet</p>
						<p style={{ color: '#555', fontSize: '0.8rem', lineHeight: 1.75 }}>Open Spotify on any device and hit play. It will appear here and sync to your partner automatically.</p>
					</div>
				</div>
			)}
		</>
	);

	if (isMobile) {
		return (
			<>
				<div className="sheet-backdrop" onClick={onClose} />
				<div className="side-sheet music-sheet bottom-sheet" style={{ maxHeight: '90vh' }}>
					{inner}
				</div>
			</>
		);
	}

	return (
		<div className="music-sidebar sidebar-desktop" style={{ ...wrapStyle, width: 360, flexShrink: 0, borderLeft: '1px solid #1f1f1f', height: '100%' }}>
			{inner}
		</div>
	);
}

// ─── Recursive chapter outline flattener ─────────────────────────────────────
async function extractChapters(pdfDoc) {
	try {
		const outline = await pdfDoc.getOutline();
		if (!outline || outline.length === 0) return [];
		const chapters = [];
		const resolveItem = async (item, level) => {
			let pageNum = null;
			try {
				if (item.dest) {
					const dest = typeof item.dest === 'string' ? await pdfDoc.getDestination(item.dest) : item.dest;
					if (dest) { const ref = dest[0]; pageNum = (await pdfDoc.getPageIndex(ref)) + 1; }
				}
			} catch {}
			if (pageNum !== null && item.title?.trim()) chapters.push({ title: item.title.trim(), page: pageNum, level });
			if (item.items?.length) { for (const child of item.items) await resolveItem(child, level + 1); }
		};
		for (const item of outline) await resolveItem(item, 1);
		chapters.sort((a, b) => a.page - b.page);
		return chapters;
	} catch (e) { console.warn('Could not extract chapters:', e); return []; }
}

// ─── ReaderPage ───────────────────────────────────────────────────────────────
export default function ReaderPage() {
	useEffect(() => { injectReaderStyles(); }, []);

	const isMobile = useIsMobile();
	const { session, navigate, setSession, user } = useApp();
	const { userId, name, color, roomId, partner } = session || {};

	const [pdfDoc, setPdfDoc] = useState(null);
	const [totalPages, setTotalPages] = useState(0);
	const [pdfLoading, setPdfLoading] = useState(true);
	const [pdfError, setPdfError] = useState('');
	const [downloadPct, setDownloadPct] = useState(0);
	const [showEndDialog, setShowEndDialog] = useState(false);
	const [ending, setEnding] = useState(false);
	const [chapters, setChapters] = useState([]);
	const [tocOpen, setTocOpen] = useState(false);
	const [musicOpen, setMusicOpen] = useState(false);
	const [musicSyncTrack, setMusicSyncTrack] = useState(null);

	useEffect(() => {
		if (!roomId) return;
		let alive = true;
		setPdfLoading(true); setPdfError(''); setDownloadPct(0);
		(async () => {
			try {
				let totalChunks = session?.book?.totalChunks;
				let title = session?.book?.title;
				if (!totalChunks) {
					const room = await getRoom(roomId);
					if (!room?.totalChunks) { if (alive) setPdfError('No PDF found for this room.'); return; }
					totalChunks = room.totalChunks; title = room.bookTitle;
					if (alive) setSession((s) => ({ ...s, hostId: s.hostId || room.hostId, book: { ...s?.book, totalChunks, title } }));
				}
				const base64 = await downloadPdfChunked(roomId, totalChunks, (pct) => { if (alive) setDownloadPct(pct); });
				const binary = atob(base64);
				const bytes = new Uint8Array(binary.length);
				for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
				const pdfDocument = await pdfjs.getDocument({ data: bytes }).promise;
				if (alive) { setPdfDoc(pdfDocument); setTotalPages(pdfDocument.numPages); const chs = await extractChapters(pdfDocument); if (alive) setChapters(chs); }
			} catch (e) { console.error(e); if (alive) setPdfError(`Failed to load PDF: ${e.message}`); }
			finally { if (alive) setPdfLoading(false); }
		})();
		return () => { alive = false; };
	}, [roomId]);

	const { myPage, partnerPage, messages, savePage, sendMessage: firebaseSend, loaded, livePartner } = useRoom({
		roomId, myUserId: userId, partnerUserId: partner?.userId && partner.userId !== 'pending' ? partner.userId : null, myName: name, myColor: color,
	});

	const _hostId = session?.hostId;
	const _amHost = userId && _hostId && userId === _hostId;

	const [currentPage, setCurrentPage] = useState(1);
	const [chatOpen, setChatOpen] = useState(false);
	const [unreadCount, setUnreadCount] = useState(0);
	const [toast, setToast] = useState(null);
	const [syncFlash, setSyncFlash] = useState(false);
	const prevMsgCount = useRef(0);
	const scrollRef = useRef();
	const restoredRef = useRef(false);

	useEffect(() => {
		if (loaded && !restoredRef.current) { restoredRef.current = true; const p = Math.max(1, Math.min(myPage + 1, totalPages || 9999)); setCurrentPage(p); }
	}, [loaded, totalPages]);

	useEffect(() => {
		if (messages.length > prevMsgCount.current) {
			const newest = messages[messages.length - 1];
			if (newest && newest.userId !== userId && !chatOpen) { setUnreadCount((c) => c + 1); setToast(newest); }
		}
		prevMsgCount.current = messages.length;
	}, [messages, chatOpen, userId]);

	useEffect(() => { if (chatOpen) { setUnreadCount(0); setToast(null); } }, [chatOpen]);
	useEffect(() => { scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }, [currentPage]);

	const openChat = useCallback(() => { setChatOpen((v) => { if (!v) { setTocOpen(false); setMusicOpen(false); } return !v; }); }, []);
	const openToc = useCallback(() => { setTocOpen((v) => { if (!v) { setChatOpen(false); setMusicOpen(false); } return !v; }); }, []);
	const openMusic = useCallback(() => { setMusicOpen((v) => { if (!v) { setChatOpen(false); setTocOpen(false); } return !v; }); }, []);

	const goToPage = useCallback((p) => {
		if (totalPages === 0) return;
		const next = Math.max(1, Math.min(totalPages, p));
		setCurrentPage(next);
		savePage(next - 1);
	}, [totalPages, savePage]);

	const syncToPartner = () => { goToPage(partnerPage + 1); setSyncFlash(true); setTimeout(() => setSyncFlash(false), 2000); };

	const handleTrackChange = useCallback((track) => { if (!roomId) return; saveMusicState(roomId, { ...track, sentAt: Date.now() }).catch(console.error); }, [roomId]);
	const handleSend = useCallback((text) => { firebaseSend(text, currentPage - 1); }, [firebaseSend, currentPage]);

	const handleEndRoom = async () => {
		setEnding(true);
		try { await deleteRoom(roomId); navigate('home'); }
		catch (e) { console.error(e); alert(`Failed to end room: ${e.message}`); setEnding(false); setShowEndDialog(false); }
	};

	const progress = totalPages > 1 ? ((currentPage - 1) / (totalPages - 1)) * 100 : 100;
	const pagesDiff = Math.abs(partnerPage + 1 - currentPage);
	const partnerObj = { ...(partner || {}), ...(livePartner || {}), page: partnerPage };
	const me = { name, color };
	const bookTitle = session?.book?.title || 'Reading…';

	// Mobile bottom nav bottom padding
	const mobileNavHeight = isMobile ? 72 : 0;

	if (!session) {
		return (
			<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--paper)', gap: '1rem', flexDirection: 'column' }}>
				<p style={{ color: 'var(--ink-faint)', fontStyle: 'italic' }}>No session found.</p>
				<button onClick={() => navigate('home')} style={{ color: 'var(--amber)', fontWeight: 600, border: '1.5px solid var(--amber)', borderRadius: 100, padding: '0.5rem 1.25rem', background: 'none', cursor: 'pointer' }}>← Go Home</button>
			</div>
		);
	}

	const anySidebarOpen = tocOpen || chatOpen || musicOpen;

	return (
		<div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--paper)', overflow: 'hidden' }}>
			{showEndDialog && <EndRoomDialog onConfirm={handleEndRoom} onCancel={() => setShowEndDialog(false)} />}

			{/* Top bar */}
			<header style={{ height: 48, flexShrink: 0, zIndex: 20, background: 'rgba(247,242,234,0.97)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid var(--paper-deep)', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0 0.9rem' }}>
				{_amHost ? (
					<button onClick={() => setShowEndDialog(true)} disabled={ending}
						style={{ color: ending ? 'var(--ink-faint)' : '#c0392b', fontSize: '0.75rem', fontWeight: 600, background: 'none', border: '1.5px solid currentColor', borderRadius: 100, padding: '3px 8px', cursor: 'pointer', opacity: ending ? 0.5 : 1, whiteSpace: 'nowrap', flexShrink: 0 }}>
						{ending ? 'Ending…' : 'End Room'}
					</button>
				) : (
					<button onClick={() => navigate('home')}
						style={{ color: 'var(--ink-faint)', fontSize: '0.75rem', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
						onMouseOver={(e) => (e.currentTarget.style.color = 'var(--amber)')}
						onMouseOut={(e) => (e.currentTarget.style.color = 'var(--ink-faint)')}>
						← Leave
					</button>
				)}

				<span style={{ color: 'var(--paper-deep)', flexShrink: 0 }}>·</span>
				<span style={{ fontFamily: "'Lora', serif", fontSize: '0.95rem', fontWeight: 700, color: 'var(--ink)', flexShrink: 0 }}>
					Page<em style={{ fontStyle: 'italic', color: 'var(--amber)' }}>Turn</em>
				</span>

				{/* Book title — hidden on very small screens */}
				{!isMobile && (
					<>
						<span style={{ color: 'var(--paper-deep)' }}>·</span>
						<span style={{ fontFamily: "'Crimson Pro', serif", fontStyle: 'italic', color: 'var(--ink-soft)', fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
							{bookTitle}
						</span>
					</>
				)}

				<div style={{ flex: 1 }} />

				{/* Room code badge */}
				<div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'var(--paper-mid)', border: '1px solid var(--paper-deep)', borderRadius: 100, padding: '3px 8px', flexShrink: 0 }}>
					<span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--sage)', display: 'inline-block', animation: 'pulse 2s ease-in-out infinite' }} />
					<span style={{ color: 'var(--ink-faint)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.05em' }}>#{roomId}</span>
				</div>

				{/* Progress — desktop only */}
				{totalPages > 0 && !isMobile && (
					<div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
						<div style={{ width: 60, height: 3, background: 'var(--paper-deep)', borderRadius: 3 }}>
							<div style={{ width: `${progress}%`, height: '100%', borderRadius: 3, background: 'linear-gradient(90deg, var(--amber), var(--amber-glow))', transition: 'width 0.4s ease' }} />
						</div>
						<span style={{ color: 'var(--ink-faint)', fontSize: '0.68rem', fontWeight: 600 }}>
							{currentPage}<span style={{ color: 'var(--paper-deep)' }}>/</span>{totalPages}
						</span>
					</div>
				)}
			</header>

			{/* Body */}
			<div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
				{/* TOC — left (desktop inline / mobile sheet) */}
				{tocOpen && (
					<TocSidebar
						chapters={chapters}
						currentPage={currentPage}
						totalPages={totalPages}
						onNavigate={(p) => goToPage(p)}
						onClose={() => setTocOpen(false)}
						isMobile={isMobile}
					/>
				)}

				{/* Main reading area */}
				<div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', minWidth: 0 }}>
					<div
						ref={scrollRef}
						className="reader-scroll"
						style={{
							flex: 1,
							overflowY: 'auto',
						}}>
						{pdfLoading ? (
							<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem', minHeight: 300, padding: '2rem' }}>
								<div style={{ width: 32, height: 32, border: '3px solid var(--paper-deep)', borderTopColor: 'var(--amber)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
								<p style={{ color: 'var(--ink-faint)', fontSize: '0.85rem', fontStyle: 'italic' }}>
									{downloadPct > 0 && downloadPct < 100 ? 'Downloading book…' : downloadPct === 100 ? 'Rendering PDF…' : 'Loading…'}
								</p>
								{downloadPct > 0 && (
									<div style={{ width: 200 }}>
										<div style={{ height: 4, background: 'var(--paper-deep)', borderRadius: 4 }}>
											<div style={{ height: '100%', width: `${downloadPct}%`, background: 'linear-gradient(90deg, var(--amber), var(--amber-glow))', borderRadius: 4, transition: 'width 0.2s ease' }} />
										</div>
										<p style={{ color: 'var(--amber)', fontSize: '0.75rem', fontWeight: 700, textAlign: 'center', marginTop: '0.3rem' }}>{downloadPct}%</p>
									</div>
								)}
							</div>
						) : pdfError ? (
							<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem', padding: '2rem', minHeight: 300 }}>
								<p style={{ color: '#c0392b', fontSize: '0.95rem', textAlign: 'center' }}>⚠️ {pdfError}</p>
								<button onClick={() => navigate('home')} style={{ color: 'var(--amber)', fontWeight: 600, border: '1.5px solid var(--amber)', borderRadius: 100, padding: '0.5rem 1.25rem', background: 'none', cursor: 'pointer' }}>← Go Home</button>
							</div>
						) : pdfDoc ? (
							<PdfPage pdfDoc={pdfDoc} pageNum={currentPage} />
						) : null}
					</div>

					{/* Partner nudge */}
					{loaded && pagesDiff > 0 && (
						<div className="toast-pop" style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#fff', border: '1px solid var(--paper-deep)', borderRadius: 100, padding: '4px 12px', fontSize: '0.72rem', color: 'var(--ink-soft)', boxShadow: 'var(--shadow-sm)', whiteSpace: 'nowrap', zIndex: 10, maxWidth: 'calc(100vw - 2rem)' }}>
							<div style={{ width: 7, height: 7, borderRadius: '50%', background: partner?.color, flexShrink: 0 }} />
							<span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{partner?.name} on p.{partnerPage + 1}</span>
							<button onClick={syncToPartner} style={{ color: 'var(--amber)', fontWeight: 700, fontSize: '0.7rem', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px dotted var(--amber)', padding: '0 1px', lineHeight: 1, flexShrink: 0 }}>
								{syncFlash ? '✓' : '→'}
							</button>
						</div>
					)}

					{/* Desktop page nav — bottom of reading area, shown only on desktop */}
					{totalPages > 0 && !isMobile && (
						<div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0.75rem 2rem 1.25rem', background: 'linear-gradient(to top, rgba(247,242,234,1) 60%, rgba(247,242,234,0))', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.25rem' }}>
							<button className="page-btn" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}
								style={{ width: 42, height: 42, borderRadius: '50%', border: `1.5px solid ${currentPage <= 1 ? 'var(--paper-deep)' : 'var(--ink)'}`, background: currentPage <= 1 ? 'transparent' : 'var(--ink)', color: currentPage <= 1 ? 'var(--paper-deep)' : '#fff', fontSize: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: currentPage <= 1 ? 'not-allowed' : 'pointer' }}>
								‹
							</button>
							<div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
								<input type="number" min={1} max={totalPages} value={currentPage}
									onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) goToPage(v); }}
									style={{ width: 54, textAlign: 'center', padding: '0.3rem 0.2rem', border: '1.5px solid var(--paper-deep)', borderRadius: 8, fontSize: '0.9rem', fontWeight: 700, color: 'var(--ink)', background: 'var(--paper)', outline: 'none', fontFamily: "'Lora', serif" }}
									onFocus={(e) => (e.target.style.borderColor = 'var(--amber)')}
									onBlur={(e) => (e.target.style.borderColor = 'var(--paper-deep)')} />
								<span style={{ color: 'var(--ink-faint)', fontSize: '0.8rem' }}>/ {totalPages}</span>
							</div>
							<button className="page-btn" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages}
								style={{ width: 42, height: 42, borderRadius: '50%', border: `1.5px solid ${currentPage >= totalPages ? 'var(--paper-deep)' : 'var(--ink)'}`, background: currentPage >= totalPages ? 'transparent' : 'var(--ink)', color: currentPage >= totalPages ? 'var(--paper-deep)' : '#fff', fontSize: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer' }}>
								›
							</button>
						</div>
					)}
				</div>

				{/* Chat — right (desktop inline / mobile sheet) */}
				{chatOpen && (
					<ChatSidebar
						messages={messages}
						partner={partnerObj}
						currentPage={currentPage - 1}
						onSend={handleSend}
						onClose={() => setChatOpen(false)}
						isMobile={isMobile}
					/>
				)}

				{/* Music — right (desktop inline / mobile sheet) */}
				{musicOpen && (
					<MusicSidebar
						roomId={roomId}
						syncedTrack={musicSyncTrack}
						onTrackChange={handleTrackChange}
						onClose={() => setMusicOpen(false)}
						isMobile={isMobile}
					/>
				)}
			</div>

			{/* Desktop floating bar */}
			<FloatingBar
				me={me} partner={partnerObj} partnerPage={partnerPage} currentPage={currentPage - 1}
				unreadCount={unreadCount} onOpenChat={openChat} onOpenToc={openToc} onOpenMusic={openMusic}
				tocOpen={tocOpen} chatOpen={chatOpen} musicOpen={musicOpen}
				toast={toast} onDismissToast={() => setToast(null)}
				hasChapters={chapters.length > 0} spotifyConnected={!!musicSyncTrack} nowPlaying={!!musicSyncTrack?.isPlaying}
			/>

			{/* Progress strip — mobile only, sits above the nav bar */}
			{isMobile && totalPages > 0 && (
				<div style={{ height: 2, background: 'var(--paper-deep)', flexShrink: 0 }}>
					<div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, var(--amber), var(--amber-glow))', transition: 'width 0.4s ease' }} />
				</div>
			)}

			{/* Mobile bottom nav bar */}
			<MobileNavBar
				me={me} partner={partnerObj} partnerPage={partnerPage} currentPage={currentPage - 1}
				unreadCount={unreadCount} onOpenChat={openChat} onOpenToc={openToc} onOpenMusic={openMusic}
				tocOpen={tocOpen} chatOpen={chatOpen} musicOpen={musicOpen}
				toast={toast} onDismissToast={() => setToast(null)}
				hasChapters={chapters.length > 0} spotifyConnected={!!musicSyncTrack} nowPlaying={!!musicSyncTrack?.isPlaying}
				onPrev={() => goToPage(currentPage - 1)} onNext={() => goToPage(currentPage + 1)}
				totalPages={totalPages}
			/>
		</div>
	);
}