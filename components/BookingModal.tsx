'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plane, Clock, User, Mail, Phone, Calendar, CheckCircle2, AlertCircle, Briefcase, Hotel, Bus, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';

interface BookingModalProps {
  offer: any;
  onClose: () => void;
}

export default function BookingModal({ offer, onClose }: BookingModalProps) {
  const { user, token, isAuthenticated } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<'details' | 'success'>('details');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBook = async () => {
    if (!isAuthenticated) {
      router.push('/auth');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const slice = offer.slices[0];
      const startSegment = slice.segments[0];
      const endSegment = slice.segments[slice.segments.length - 1];
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';

      const response = await fetch(`${backendUrl}/api/reservations`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          reservation_type: 'flight',
          provider: 'Duffel',
          provider_booking_ref: `MOCK-${Math.floor(Math.random() * 1000000)}`,
          origin: startSegment.origin.iata_code,
          destination: endSegment.destination.iata_code,
          departure_datetime: startSegment.departing_at,
          arrival_datetime: endSegment.arriving_at,
          passengers: offer.passengers.length,
          total_amount: offer.display_price || offer.total_amount,
          currency: offer.total_currency,
          booking_details: JSON.stringify({ 
            passengers: {
              given_name: user?.first_name || 'Passenger',
              family_name: user?.last_name || 'Details',
              email: user?.email || '',
              phone_number: 'Contact in Profile',
              born_on: 'N/A',
              gender: 'u'
            }
          })
        }),
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      setStep('success');
    } catch (err: any) {
      setError(err.message || 'Error connecting to backend database');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
      />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden glass-card rounded-[40px] shadow-2xl border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 px-10 py-8 border-b border-border backdrop-blur-3xl bg-background/40 flex justify-between items-center">
          <div>
            <h2 className="text-3xl title-text text-foreground">Flight Reservation</h2>
            <p className="text-muted-foreground text-xs small-caps mt-1 tracking-[0.2em]">Step {step === 'details' ? 1 : 2} of 2 • {step === 'details' ? 'Review Itinerary' : 'Confirmation'}</p>
          </div>
          <button 
            onClick={onClose}
            className="w-12 h-12 rounded-full bg-muted hover:bg-foreground/5 flex items-center justify-center transition-all border border-border"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="overflow-y-auto p-10 custom-scrollbar max-h-[calc(90vh-100px)]">
          <AnimatePresence mode="wait">
            {step === 'details' && (
              <motion.div 
                key="details"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-10"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  <div className="space-y-8">
                    <div className="small-caps text-muted-foreground/40 text-[10px]">Your Itinerary</div>
                    {offer.slices.map((slice: any, idx: number) => (
                      <div key={idx} className="space-y-6">
                        {slice.segments.map((segment: any, sIdx: number) => (
                          <div key={sIdx} className="relative pl-8 border-l border-border space-y-4">
                            <div className="absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full bg-muted-foreground/20" />
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="text-2xl font-light text-foreground">{format(new Date(segment.departing_at), 'HH:mm')}</div>
                                <div className="text-muted-foreground text-sm font-light mt-1">{segment.origin.iata_code}</div>
                              </div>
                              <div className="text-right">
                                <div className="text-2xl font-light text-foreground">{format(new Date(segment.arriving_at), 'HH:mm')}</div>
                                <div className="text-muted-foreground text-sm font-light mt-1">{segment.destination.iata_code}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 py-3 px-4 bg-muted rounded-2xl border border-border">
                              <Plane className="w-4 h-4 text-muted-foreground/40" />
                              <div className="text-xs text-muted-foreground/60">
                                <span className="text-foreground font-medium">{segment.marketing_carrier.name}</span> • Flight {segment.marketing_carrier_flight_number}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}

                    {(offer.bundled_hotel || offer.bundled_bus) && (
                      <div className="space-y-8 pt-8 border-t border-border">
                        <div className="small-caps text-muted-foreground/40 text-[10px]">Bundled Services</div>
                        <div className="grid gap-6">
                          {offer.bundled_hotel && (
                            <div className="flex gap-6 p-6 rounded-3xl bg-muted border border-border">
                              <div className="relative w-24 h-24 rounded-2xl overflow-hidden shrink-0">
                                <Image 
                                  src={`https://picsum.photos/seed/${offer.bundled_hotel.id}/300/300`} 
                                  alt={offer.bundled_hotel.name}
                                  fill
                                  className="object-cover opacity-80"
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <Hotel className="w-4 h-4" />
                                  <span className="small-caps text-[10px] tracking-widest">Premium Hotel</span>
                                </div>
                                <h4 className="text-xl font-light text-foreground">{offer.bundled_hotel.name}</h4>
                                <p className="text-muted-foreground text-xs flex items-center gap-2">
                                  <MapPin className="w-3 h-3" />
                                  {offer.bundled_hotel.location}
                                </p>
                                <p className="text-muted-foreground/60 text-[10px] leading-relaxed italic">
                                  &quot;{offer.bundled_hotel.description}&quot;
                                </p>
                              </div>
                            </div>
                          )}
                          {offer.bundled_bus && (
                            <div className="flex gap-6 p-6 rounded-3xl bg-muted border border-border">
                              <div className="relative w-24 h-24 rounded-2xl overflow-hidden shrink-0">
                                <Image 
                                  src={`https://picsum.photos/seed/${offer.bundled_bus.id}/300/300`} 
                                  alt={offer.bundled_bus.operator}
                                  fill
                                  className="object-cover opacity-80"
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <Bus className="w-4 h-4" />
                                  <span className="small-caps text-[10px] tracking-widest">Ground Transport</span>
                                </div>
                                <h4 className="text-xl font-light text-foreground">{offer.bundled_bus.operator}</h4>
                                <p className="text-muted-foreground text-xs flex items-center gap-2">
                                  <MapPin className="w-3 h-3" />
                                  {offer.bundled_bus.location}
                                </p>
                                <div className="flex flex-wrap gap-2 pt-1">
                                  {offer.bundled_bus.amenities.map((a: string) => (
                                    <span key={a} className="text-[8px] uppercase tracking-widest text-muted-foreground/40 bg-background/5 px-2 py-1 rounded-full border border-border">{a}</span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-8">
                    <div className="small-caps text-muted-foreground/40 text-[10px]">Fare Summary</div>
                    <div className="glass-card p-8 rounded-3xl space-y-6 border border-border">
                      <div className="space-y-3">
                        {['adult', 'child'].map((type) => {
                          const count = offer.passengers.filter((p: any) => p.type === type).length;
                          if (count === 0) return null;
                          return (
                            <div key={type} className="flex justify-between items-center text-xs">
                              <span className="text-muted-foreground font-light capitalize">{count} {type}{count > 1 ? (type === 'child' ? 'ren' : 's') : ''}</span>
                              <span className="font-medium text-foreground">{offer.total_currency} {(parseFloat(offer.total_amount) / offer.passengers.length * count).toLocaleString()}</span>
                            </div>
                          );
                        })}
                        {offer.estimated_baggage_fee > 0 ? (
                          <div className="flex justify-between items-center text-xs pt-2 border-t border-border">
                            <span className="text-amber-600/60 font-light flex items-center gap-2">
                              <Briefcase className="w-3 h-3" />
                              Estimated Baggage Fee
                            </span>
                            <span className="text-amber-600 font-medium">{offer.total_currency} {offer.estimated_baggage_fee.toLocaleString()}</span>
                          </div>
                        ) : offer.total_included_baggage > 0 && (
                          <div className="flex justify-between items-center text-xs pt-2 border-t border-border">
                            <span className="text-emerald-600/60 font-light flex items-center gap-2">
                              <Briefcase className="w-3 h-3" />
                              Checked Baggage
                            </span>
                            <span className="text-emerald-600 font-medium uppercase text-[10px]">Included</span>
                          </div>
                        )}
                        {offer.bundled_hotel && (
                          <div className="flex justify-between items-center text-xs pt-2 border-t border-border">
                            <span className="text-muted-foreground/60 font-light flex items-center gap-2">
                              <Hotel className="w-3 h-3" />
                              {offer.bundled_hotel.name}
                            </span>
                            <span className="text-foreground font-medium">{offer.total_currency} {offer.bundled_hotel.price.toLocaleString()}</span>
                          </div>
                        )}
                        {offer.bundled_bus && (
                          <div className="flex justify-between items-center text-xs pt-2 border-t border-border">
                            <span className="text-muted-foreground/60 font-light flex items-center gap-2">
                              <Bus className="w-3 h-3" />
                              {offer.bundled_bus.operator} ({offer.bundled_bus.class})
                            </span>
                            <span className="text-foreground font-medium">{offer.total_currency} {offer.bundled_bus.price.toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                      <div className="pt-4 border-t border-border space-y-3">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground font-light">Base Fare</span>
                          <span className="font-medium text-foreground">{offer.total_currency} {parseFloat(offer.base_amount).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground font-light">Taxes & Fees</span>
                          <span className="font-medium text-foreground">{offer.total_currency} {parseFloat(offer.tax_amount).toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="pt-6 border-t border-border flex justify-between items-end">
                        <span className="small-caps text-muted-foreground/40">Total Amount</span>
                        <span className="text-4xl font-light title-text text-foreground">{offer.total_currency} {(offer.display_price || parseFloat(offer.total_amount)).toLocaleString()}</span>
                      </div>
                    </div>
                    
                    <div className="p-6 bg-muted rounded-3xl border border-border space-y-4">
                      <div className="flex items-start gap-4">
                        <AlertCircle className="w-5 h-5 text-muted-foreground/40 mt-0.5" />
                        <p className="text-xs text-muted-foreground/60 leading-relaxed font-light">
                          This fare includes standard cabin baggage. 
                          {offer.passengers.some((p: any) => p.baggages?.length > 0) ? ' Checked baggage is included for selected travelers.' : ' Additional checked baggage can be managed after booking confirmation.'}
                        </p>
                      </div>
                      {offer.passengers.some((p: any) => p.baggages?.length > 0) && (
                        <div className="flex flex-wrap gap-2 pt-2">
                          {offer.passengers.map((p: any, idx: number) => p.baggages?.map((b: any, bIdx: number) => (
                            <div key={`${idx}-${bIdx}`} className="px-3 py-1.5 rounded-xl bg-background/5 border border-border text-[9px] uppercase tracking-widest text-muted-foreground/60">
                              {b.type} Bag ({p.type})
                            </div>
                          )))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-4 pt-8">
                  {error && (
                    <div className="w-full p-4 bg-red-500/5 border border-red-500/10 rounded-2xl text-red-600 flex items-center gap-3">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span className="text-xs font-medium">{error}</span>
                    </div>
                  )}
                  <button 
                    onClick={handleBook}
                    disabled={isLoading}
                    className="btn-primary flex items-center gap-3 px-10 py-4 disabled:opacity-50"
                  >
                    {isLoading ? (
                      <>
                        Processing Reservation...
                        <div className="w-4 h-4 border-2 border-background/20 border-t-background rounded-full animate-spin" />
                      </>
                    ) : (
                      <>
                        {isAuthenticated ? 'Confirm & Book Ticket' : 'Sign In to Book'}
                        <CheckCircle2 className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
              )}

            {step === 'success' && (
              <motion.div 
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-20 text-center space-y-8"
              >
                <div className="w-24 h-24 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto border border-emerald-500/20">
                  <CheckCircle2 className="w-12 h-12 text-emerald-600" />
                </div>
                <div className="space-y-4">
                  <h2 className="text-5xl title-text text-foreground">Reservation Confirmed</h2>
                  <p className="text-muted-foreground max-w-md mx-auto leading-relaxed font-light">
                    Your journey has been successfully reserved. A confirmation email has been sent to your inbox.
                  </p>
                </div>
                <div className="pt-8">
                  <button 
                    onClick={onClose}
                    className="btn-secondary px-12 py-4"
                  >
                    Close Window
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
