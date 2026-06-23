'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '@/hooks/useAuth';
import { PlaneTakeoff, User, BookOpen, LogIn, LogOut, Menu, X, Sparkles, ShoppingCart } from 'lucide-react';

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [hasTrip, setHasTrip] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const readCart = () => {
      try {
        const raw = localStorage.getItem('travelEliteCart');
        const cart = raw ? JSON.parse(raw) : null;
        setCartCount(cart?.items?.length || 0);
      } catch { setCartCount(0); }
    };
    readCart();
    window.addEventListener('storage', readCart);
    return () => window.removeEventListener('storage', readCart);
  }, []);

  useEffect(() => {
    const checkTrip = () => {
      try {
        const hasResults = !!localStorage.getItem('travelEliteResults');
        const onCartPage = window.location.pathname === '/cart';
        setHasTrip(hasResults || onCartPage);
      } catch { setHasTrip(false); }
    };
    checkTrip();
    window.addEventListener('storage', checkTrip);
    return () => window.removeEventListener('storage', checkTrip);
  }, [pathname]);

  const showCart = hasTrip;

  const navLinks = [
    { href: '/planner', label: 'AI Planner', icon: Sparkles },
    { href: '/reservations', label: 'Reservations', icon: BookOpen },
  ];

  const handleLogout = () => {
    logout();
    router.push('/auth');
    setMobileOpen(false);
  };

  const handleAuthLink = (e: React.MouseEvent, href: string) => {
    if (href === '/reservations' && !isAuthenticated) {
      e.preventDefault();
      router.push('/auth');
    }
  };

  const isActiveLink = (href: string) => {
    if (href === '/planner') return pathname === '/' || pathname === '/planner';
    return pathname === href;
  };

  return (
    <>
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled ? 'py-3 bg-background/80 backdrop-blur-xl border-b border-border' : 'py-5'
      }`}>
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <PlaneTakeoff className="w-5 h-5 group-hover:rotate-12 transition-transform duration-300" />
            <span className="title-text text-xl tracking-wider">TRAVEL ELITE</span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map(link => {
              return (
                <Link key={link.href} href={link.href}
                  onClick={(e) => handleAuthLink(e, link.href)}
                  className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition-all ${
                    isActiveLink(link.href)
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}>
                  <link.icon className="w-3.5 h-3.5" />
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Desktop Auth */}
          {showCart ? (
            <Link
              href="/cart"
              className="relative hidden h-9 w-9 items-center justify-center rounded-2xl transition hover:bg-muted md:flex"
            >
              <ShoppingCart className="h-4 w-4" />
              {cartCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-[10px] font-black text-background">
                  {cartCount}
                </span>
              ) : null}
            </Link>
          ) : null}
          <div className="hidden md:flex items-center gap-3">
            {isAuthenticated ? (
              <>
                <Link href="/profile"
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all small-caps tracking-wider">
                  <User className="w-3.5 h-3.5" />
                  {user?.first_name || 'Profile'}
                </Link>
                <button onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm border border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-all small-caps tracking-wider">
                  <LogOut className="w-3.5 h-3.5" /> Sign Out
                </button>
              </>
            ) : (
              <Link href="/auth"
                className="flex items-center gap-2 px-5 py-2.5 bg-foreground text-background rounded-xl text-sm small-caps tracking-wider hover:opacity-90 transition-all">
                <LogIn className="w-3.5 h-3.5" /> Sign In
              </Link>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button onClick={() => setMobileOpen(v => !v)}
            className="md:hidden p-2 rounded-xl hover:bg-muted transition-colors">
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Dark Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-[60] bg-background/20 backdrop-blur-sm md:hidden"
            />
            
            {/* Menu Content */}
            <motion.div
              initial={{ opacity: 0, x: '100%' }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 w-[85%] max-w-sm z-[70] bg-background border-l border-border md:hidden p-8 flex flex-col shadow-2xl">
              <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-2">
                  <PlaneTakeoff className="w-5 h-5" />
                  <span className="title-text text-xl tracking-wider">TRAVEL ELITE</span>
                </div>
                <button onClick={() => setMobileOpen(false)}
                  className="p-2 rounded-xl hover:bg-muted transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4 flex-1">
                <div className="small-caps text-[10px] text-muted-foreground/50 mb-4 px-4">CURATED ELITE TRAVEL</div>
                {navLinks.map(link => {
                  return (
                    <Link key={link.href} href={link.href} onClick={(e) => { setMobileOpen(false); handleAuthLink(e, link.href); }}
                      className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-all ${
                        isActiveLink(link.href)
                          ? 'bg-foreground text-background'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}>
                      <link.icon className={`w-5 h-5 ${isActiveLink(link.href) ? 'opacity-100' : 'opacity-40'}`} /> 
                      <span className="font-medium uppercase text-xs tracking-[0.1em]">{link.label}</span>
                    </Link>
                  );
                })}
              </div>

              <div className="pt-8 border-t border-border mt-auto space-y-4">
                {showCart ? (
                  <Link
                    href="/cart"
                    onClick={() => setMobileOpen(false)}
                    className="relative flex h-9 w-9 items-center justify-center rounded-2xl transition hover:bg-muted"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    {cartCount > 0 ? (
                      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-[10px] font-black text-background">
                        {cartCount}
                      </span>
                    ) : null}
                  </Link>
                ) : null}
                {isAuthenticated ? (
                  <>
                    <Link href="/profile" onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-4 px-5 py-4 rounded-2xl text-sm tracking-wide hover:bg-muted text-foreground">
                      <User className="w-5 h-5 opacity-40" /> 
                      <span className="font-medium uppercase text-xs tracking-[0.1em]">Profile</span>
                    </Link>
                    <button onClick={handleLogout}
                      className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-sm tracking-wide hover:bg-muted text-foreground">
                      <LogOut className="w-5 h-5 opacity-40" /> 
                      <span className="font-medium uppercase text-xs tracking-[0.1em]">Sign Out</span>
                    </button>
                  </>
                ) : (
                  <Link href="/auth" onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-4 px-5 py-5 rounded-2xl text-sm tracking-wide bg-foreground text-background shadow-xl shadow-foreground/20">
                    <LogIn className="w-5 h-5" /> 
                    <span className="font-black uppercase text-xs tracking-[0.2em]">Sign In</span>
                  </Link>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
