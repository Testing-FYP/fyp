'use client';

import { motion } from 'motion/react';
import { useCurrency } from '@/context/CurrencyContext';
import { Bus, Clock, MapPin, CheckCircle2, ArrowRight } from 'lucide-react';
import Image from 'next/image';

interface BusCardProps {
  offer: any;
}

export default function BusCard({ offer }: BusCardProps) {
  const { convertFromUSD, currency } = useCurrency();
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
            alt={offer.operator} 
            fill 
            className="object-cover group-hover:scale-110 transition-transform duration-700 opacity-80"
            referrerPolicy="no-referrer"
          />
          <div className="absolute top-4 left-4 bg-background/40 backdrop-blur-md px-3 py-1 rounded-full border border-border flex items-center gap-1">
            <Bus className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] font-bold text-foreground uppercase tracking-widest">{offer.operator}</span>
          </div>
        </div>

        <div className="flex-1 p-8 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Bus className="w-4 h-4" />
                  <span className="small-caps !text-[9px]">Ground Transport</span>
                </div>
                <div className="flex items-center gap-4">
                  <h3 className="text-3xl title-text leading-tight text-foreground">City Center</h3>
                  <ArrowRight className="w-6 h-6 text-muted-foreground/20" />
                  <h3 className="text-3xl title-text leading-tight text-foreground">Destination</h3>
                </div>
                <div className="flex items-center gap-4 text-muted-foreground text-sm">
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    <span>{offer.class}</span>
                  </div>
                  <div className="w-1 h-1 rounded-full bg-border" />
                  <span>{offer.duration}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground mb-1">One Way</div>
                <div className="text-4xl title-text text-foreground">{convertFromUSD(offer.price)}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest">{currency}</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {offer.amenities.map((amenity: string) => (
                <div key={amenity} className="flex items-center gap-1.5 bg-muted px-3 py-1.5 rounded-full border border-border">
                  <CheckCircle2 className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{amenity}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-6 border-t border-border">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center border border-border">
                <MapPin className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest">
                Central Station <br />
                <span className="text-muted-foreground/40">Platform 4B</span>
              </div>
            </div>
            <button className="btn-primary px-8 py-3 text-[10px] uppercase tracking-widest">
              Book Seat
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
