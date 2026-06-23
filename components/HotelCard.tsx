'use client';

import { motion } from 'motion/react';
import { Hotel, Star, MapPin, CheckCircle2 } from 'lucide-react';
import Image from 'next/image';
import { useCurrency } from '@/context/CurrencyContext';

interface HotelCardProps {
  offer: any;
}

export default function HotelCard({ offer }: HotelCardProps) {
  const { convertFromUSD, currency } = useCurrency();
  const sourceBadge = offer.dataSource === 'groq'
    ? { label: '🤖 Groq', className: 'bg-violet-500/15 text-violet-700 dark:text-violet-300' }
    : offer.dataSource === 'deepseek'
      ? { label: '🤖 DeepSeek', className: 'bg-blue-500/15 text-blue-700 dark:text-blue-300' }
      : offer.dataSource === 'groq-fallback'
        ? { label: '🤖 DeepSeek → Groq', className: 'bg-orange-500/15 text-orange-700 dark:text-orange-300' }
        : { label: '📡 SerpAPI', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' };
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card group overflow-hidden rounded-[32px] border border-border hover:border-foreground/10 transition-all duration-500"
    >
      <div className="flex flex-col md:flex-row h-full">
        <div className="relative w-full md:w-1/3 h-64 md:h-auto overflow-hidden">
          <Image 
            src={`https://picsum.photos/seed/${offer.id}/800/600`} 
            alt={offer.name} 
            fill 
            className="object-cover group-hover:scale-110 transition-transform duration-700 opacity-80"
            referrerPolicy="no-referrer"
          />
          <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 flex items-center gap-1">
            <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
            <span className="text-[10px] font-bold text-white">{offer.rating}</span>
          </div>
        </div>

        <div className="flex-1 p-8 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Hotel className="w-4 h-4" />
                  <span className="small-caps !text-[9px]">Premium Accommodation</span>
                </div>
                <h3 className="text-3xl title-text leading-tight text-foreground">{offer.name}</h3>
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <MapPin className="w-4 h-4" />
                  <span>{offer.location || 'Luxury District, City Center'}</span>
                </div>
              </div>
              <div className="text-right">
                <span className={`mb-2 inline-flex rounded-full px-2 py-1 text-[9px] font-bold ${sourceBadge.className}`}>{sourceBadge.label}</span>
                <div className="text-sm text-muted-foreground mb-1">Per Night</div>
                <div className="text-4xl title-text text-foreground">{convertFromUSD(offer.price)}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest">{currency}</div>
              </div>
            </div>

            <p className="text-muted-foreground text-sm font-light leading-relaxed line-clamp-2">
              {offer.description}
            </p>

            <div className="flex flex-wrap gap-3">
              {(offer.amenities || ['Free WiFi', 'Pool', 'Spa', 'Gym']).map((amenity: string) => (
                <div key={amenity} className="flex items-center gap-1.5 bg-muted px-3 py-1.5 rounded-full border border-border">
                  <CheckCircle2 className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{amenity}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-6 border-t border-border">
            <div className="flex -space-x-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="w-8 h-8 rounded-full border-2 border-background bg-muted overflow-hidden">
                  <Image src={`https://i.pravatar.cc/100?img=${i + 10}`} alt="User" width={32} height={32} />
                </div>
              ))}
              <div className="w-8 h-8 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[10px] text-muted-foreground">
                +12
              </div>
            </div>
            <button className="btn-primary px-8 py-3 text-[10px] uppercase tracking-widest">
              Book Stay
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
