'use client';
import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useAuth, BACKEND_URL } from '@/hooks/useAuth';
import { toast } from 'sonner';
import {
  User, Phone, Globe, CreditCard, MapPin, FileText, Camera,
  Save, ChevronRight, Bell, Wallet, Languages, ArrowLeft
} from 'lucide-react';

interface Profile {
  id: string; email: string; first_name: string; last_name: string; phone?: string;
  date_of_birth?: string; nationality?: string; passport_number?: string;
  address?: string; city?: string; country?: string; bio?: string;
  avatar_url?: string; preferred_currency?: string;
  preferred_language?: string; notifications_enabled?: boolean;
}

export default function ProfilePage() {
  const { user, isAuthenticated, isLoading: authLoading, token, logout } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState<Partial<Profile>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/auth');
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!token) return;
    fetch(`${BACKEND_URL}/api/profile`, { 
      headers: { Authorization: `Bearer ${token}` } 
    })
      .then(async res => {
        if (res.status === 401) {
          logout();
          router.push('/auth');
          return;
        }
        if (!res.ok) throw new Error('Failed to fetch profile');
        return res.json();
      })
      .then(data => {
        if (data && data.profile) { 
          setProfile(data.profile); 
          setForm(data.profile); 
        }
      })
      .catch(err => {
        console.error('Profile fetch error:', err);
      });
  }, [token, router, logout]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setForm(f => ({
      ...f,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleSave = async () => {
    if (!token) return;
    setIsSaving(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Failed to save profile');
      toast.success('Profile saved.');
    } catch {
      toast.error('Could not save profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    setIsUploading(true);
    const fd = new FormData();
    fd.append('avatar', file);
    const res = await fetch(`${BACKEND_URL}/api/profile/avatar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    const data = await res.json();
    if (data.avatar_url) setForm(f => ({ ...f, avatar_url: data.avatar_url }));
    setIsUploading(false);
  };

  if (authLoading || !profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="w-8 h-8 border-2 border-foreground/20 border-t-foreground rounded-full" />
      </div>
    );
  }

  const avatarSrc = form.avatar_url
    ? `${BACKEND_URL}${form.avatar_url}`
    : `https://ui-avatars.com/api/?name=${encodeURIComponent(form.first_name || 'U')}&background=random&size=128`;

  return (
    <main className="min-h-screen bg-background pt-24 pb-20 px-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-12">
          <button onClick={() => router.push('/')} className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Planner
          </button>
          <div className="flex items-center gap-3 text-muted-foreground mb-2">
            <User className="w-5 h-5" />
            <span className="small-caps tracking-widest">My Account</span>
          </div>
          <h1 className="text-5xl title-text">Profile</h1>
        </motion.div>

        {/* Avatar Section */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="flex items-center gap-6 bg-card border border-border rounded-3xl p-8 mb-8">
          <div className="relative group">
            <img src={avatarSrc} alt="Avatar" className="w-24 h-24 rounded-full object-cover border-2 border-border" />
            <button onClick={() => fileRef.current?.click()}
              className="absolute inset-0 rounded-full bg-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera className="w-5 h-5 text-background" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          </div>
          <div>
            <h2 className="text-2xl title-text">{form.first_name} {form.last_name}</h2>
            <p className="text-muted-foreground text-sm">{form.email || user?.email}</p>
            <button onClick={() => fileRef.current?.click()} disabled={isUploading}
              className="mt-3 text-xs small-caps tracking-wider text-muted-foreground hover:text-foreground transition-colors border border-border px-3 py-1.5 rounded-xl">
              {isUploading ? 'Uploading...' : 'Change Photo'}
            </button>
          </div>
        </motion.div>

        {/* Form Fields */}
        <div className="space-y-6">
          {/* Personal Info */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="bg-card border border-border rounded-3xl p-8">
            <h3 className="text-lg title-text mb-6 flex items-center gap-2">
              <User className="w-5 h-5 text-muted-foreground" /> Personal Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-xs small-caps tracking-wider text-muted-foreground">First Name</label>
                <input name="first_name" value={form.first_name || ''} onChange={handleChange}
                  className="w-full px-4 py-3 bg-muted border border-border rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all" />
              </div>
              <div className="space-y-2">
                <label className="text-xs small-caps tracking-wider text-muted-foreground">Last Name</label>
                <input name="last_name" value={form.last_name || ''} onChange={handleChange}
                  className="w-full px-4 py-3 bg-muted border border-border rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all" />
              </div>
              <div className="space-y-2">
                <label className="text-xs small-caps tracking-wider text-muted-foreground">Email</label>
                <input value={form.email || ''} readOnly
                  className="w-full px-4 py-3 bg-muted/50 border border-border rounded-2xl text-sm opacity-60 cursor-not-allowed" />
              </div>
              <div className="space-y-2">
                <label className="text-xs small-caps tracking-wider text-muted-foreground">Phone Number</label>
                <input name="phone" value={form.phone || ''} onChange={handleChange} placeholder="+1 234 567 8900"
                  className="w-full px-4 py-3 bg-muted border border-border rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all" />
              </div>
              <div className="space-y-2">
                <label className="text-xs small-caps tracking-wider text-muted-foreground">Date of Birth</label>
                <input type="date" name="date_of_birth" value={form.date_of_birth?.split('T')[0] || ''} onChange={handleChange}
                  className="w-full px-4 py-3 bg-muted border border-border rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all" />
              </div>
            </div>
          </motion.div>

          {/* Travel Documents */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="bg-card border border-border rounded-3xl p-8">
            <h3 className="text-lg title-text mb-6 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-muted-foreground" /> Travel Documents
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-xs small-caps tracking-wider text-muted-foreground">Nationality</label>
                <input name="nationality" value={form.nationality || ''} onChange={handleChange} placeholder="e.g. American"
                  className="w-full px-4 py-3 bg-muted border border-border rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all" />
              </div>
              <div className="space-y-2">
                <label className="text-xs small-caps tracking-wider text-muted-foreground">Passport Number</label>
                <input name="passport_number" value={form.passport_number || ''} onChange={handleChange} placeholder="e.g. A12345678"
                  className="w-full px-4 py-3 bg-muted border border-border rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all" />
              </div>
            </div>
          </motion.div>

          {/* Address */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
            className="bg-card border border-border rounded-3xl p-8">
            <h3 className="text-lg title-text mb-6 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-muted-foreground" /> Address
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs small-caps tracking-wider text-muted-foreground">Street Address</label>
                <input name="address" value={form.address || ''} onChange={handleChange}
                  className="w-full px-4 py-3 bg-muted border border-border rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all" />
              </div>
              <div className="space-y-2">
                <label className="text-xs small-caps tracking-wider text-muted-foreground">City</label>
                <input name="city" value={form.city || ''} onChange={handleChange}
                  className="w-full px-4 py-3 bg-muted border border-border rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all" />
              </div>
              <div className="space-y-2">
                <label className="text-xs small-caps tracking-wider text-muted-foreground">Country</label>
                <input name="country" value={form.country || ''} onChange={handleChange}
                  className="w-full px-4 py-3 bg-muted border border-border rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all" />
              </div>
            </div>
          </motion.div>

          {/* Bio & Preferences */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="bg-card border border-border rounded-3xl p-8">
            <h3 className="text-lg title-text mb-6 flex items-center gap-2">
              <FileText className="w-5 h-5 text-muted-foreground" /> About & Preferences
            </h3>
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs small-caps tracking-wider text-muted-foreground">Bio</label>
                <textarea name="bio" value={form.bio || ''} onChange={handleChange} rows={3}
                  placeholder="Tell us about yourself and your travel style..."
                  className="w-full px-4 py-3 bg-muted border border-border rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all resize-none" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-xs small-caps tracking-wider text-muted-foreground flex items-center gap-1">
                    <Wallet className="w-3.5 h-3.5" /> Preferred Currency
                  </label>
                  <select name="preferred_currency" value={form.preferred_currency || 'USD'} onChange={handleChange}
                    className="w-full px-4 py-3 bg-muted border border-border rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all">
                    {['USD','EUR','GBP','AED','SAR','JPY','CAD','AUD'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs small-caps tracking-wider text-muted-foreground flex items-center gap-1">
                    <Languages className="w-3.5 h-3.5" /> Language
                  </label>
                  <select name="preferred_language" value={form.preferred_language || 'en'} onChange={handleChange}
                    className="w-full px-4 py-3 bg-muted border border-border rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all">
                    {[['en','English'],['ar','Arabic'],['fr','French'],['de','German'],['es','Spanish'],['zh','Chinese']].map(([val,label]) =>
                      <option key={val} value={val}>{label}</option>)}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className={`relative w-11 h-6 rounded-full transition-colors duration-300 ${form.notifications_enabled ? 'bg-foreground' : 'bg-muted-foreground/30'}`}>
                  <div className={`absolute top-1 w-4 h-4 bg-background rounded-full transition-all duration-300 ${form.notifications_enabled ? 'left-6' : 'left-1'}`} />
                </div>
                <input type="checkbox" name="notifications_enabled" checked={!!form.notifications_enabled} onChange={handleChange} className="hidden" />
                <span className="text-sm flex items-center gap-2"><Bell className="w-4 h-4 text-muted-foreground" /> Email Notifications</span>
              </label>
            </div>
          </motion.div>

          {/* Save Button */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
            className="flex items-center gap-4">
            <button onClick={handleSave} disabled={isSaving}
              className="flex items-center gap-2 px-8 py-4 bg-foreground text-background rounded-2xl text-sm font-medium small-caps tracking-wider hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50">
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </motion.div>
        </div>
      </div>
    </main>
  );
}
