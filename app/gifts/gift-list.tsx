"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Gift = {
  id: string;
  title: string;
  url: string;
  priceCents: number | null;
  priority: number;
  note: string;
  reserved: boolean;
  createdAt: string;
};

const reservationStorageKey = "tengen-gift-reservations-v1";
const priceFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const priorityLabels: Record<number, string> = {
  3: "Most wanted",
  2: "Would love",
  1: "Nice to have",
};

function retailerName(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Retailer";
  }
}

function readReservationTokens() {
  try {
    const value = JSON.parse(window.localStorage.getItem(reservationStorageKey) ?? "{}");
    return value && typeof value === "object" ? value as Record<string, string> : {};
  } catch {
    return {};
  }
}

function writeReservationTokens(tokens: Record<string, string>) {
  window.localStorage.setItem(reservationStorageKey, JSON.stringify(tokens));
}

async function fetchGifts() {
  const response = await fetch("/api/gifts", { cache: "no-store" });
  const body = await response.json() as { gifts?: Gift[]; error?: string };
  if (!response.ok || !body.gifts) throw new Error(body.error || "Gift ideas could not be loaded");
  return body.gifts;
}

export function GiftList() {
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [tokens, setTokens] = useState<Record<string, string>>(
    () => typeof window === "undefined" ? {} : readReservationTokens(),
  );
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadGifts = useCallback(async () => {
    setError(null);
    try {
      setGifts(await fetchGifts());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Gift ideas could not be loaded");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchGifts()
      .then((nextGifts) => { if (!cancelled) setGifts(nextGifts); })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Gift ideas could not be loaded");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const availableCount = useMemo(() => gifts.filter((gift) => !gift.reserved).length, [gifts]);

  async function reserveGift(giftId: string) {
    setPendingId(giftId);
    setError(null);
    try {
      const response = await fetch(`/api/gifts/${giftId}/reservation`, { method: "POST" });
      const body = await response.json() as { token?: string; error?: string };
      if (!response.ok || !body.token) throw new Error(body.error || "This gift could not be reserved");
      const nextTokens = { ...tokens, [giftId]: body.token };
      setTokens(nextTokens);
      writeReservationTokens(nextTokens);
      setGifts((current) => current.map((gift) => gift.id === giftId ? { ...gift, reserved: true } : gift));
      setConfirmingId(null);
    } catch (reserveError) {
      const message = reserveError instanceof Error ? reserveError.message : "This gift could not be reserved";
      setError(message);
      try {
        setGifts(await fetchGifts());
      } catch {
        // Keep the original reservation error visible; the list can be retried separately.
      }
    } finally {
      setPendingId(null);
    }
  }

  async function releaseGift(giftId: string) {
    const token = tokens[giftId];
    if (!token) return;
    setPendingId(giftId);
    setError(null);
    try {
      const response = await fetch(`/api/gifts/${giftId}/reservation`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "The reservation could not be released");
      const nextTokens = { ...tokens };
      delete nextTokens[giftId];
      setTokens(nextTokens);
      writeReservationTokens(nextTokens);
      setGifts((current) => current.map((gift) => gift.id === giftId ? { ...gift, reserved: false } : gift));
    } catch (releaseError) {
      setError(releaseError instanceof Error ? releaseError.message : "The reservation could not be released");
    } finally {
      setPendingId(null);
    }
  }

  if (loading) {
    return <section className="gift-loading" aria-live="polite"><span /> Reading the list…</section>;
  }

  if (error && !gifts.length) {
    return (
      <section className="gift-empty-state" role="alert">
        <p>{error}</p>
        <button type="button" onClick={() => void loadGifts()}>Try again</button>
      </section>
    );
  }

  if (!gifts.length) {
    return <section className="gift-empty-state"><p>The list is being put together. Check back soon.</p></section>;
  }

  return (
    <section className="gift-registry" aria-labelledby="gift-list-heading">
      <div className="gift-list-intro">
        <div>
          <p className="section-kicker">The list</p>
          <h2 id="gift-list-heading">Choose something that feels right.</h2>
        </div>
        <span>{availableCount} of {gifts.length} available</span>
      </div>

      {error ? <p className="gift-inline-error" role="alert">{error}</p> : null}

      <div className="gift-grid">
        {gifts.map((gift) => {
          const ownReservation = gift.reserved && Boolean(tokens[gift.id]);
          return (
            <article className={`gift-card${gift.reserved ? " gift-card-reserved" : ""}`} key={gift.id}>
              <div className="gift-card-topline">
                <span className={`gift-priority gift-priority-${gift.priority}`}>{priorityLabels[gift.priority]}</span>
                <span>{retailerName(gift.url)}</span>
              </div>
              <div className="gift-card-copy">
                <h3>{gift.title}</h3>
                <p className="gift-price">{gift.priceCents === null ? "Price varies" : priceFormatter.format(gift.priceCents / 100)}</p>
                {gift.note ? <p className="gift-note">{gift.note}</p> : null}
              </div>
              <div className="gift-card-actions">
                <a href={gift.url} target="_blank" rel="noreferrer">View at retailer</a>
                {!gift.reserved ? (
                  <button type="button" onClick={() => setConfirmingId(gift.id)} disabled={pendingId === gift.id}>Reserve gift</button>
                ) : ownReservation ? (
                  <button type="button" className="gift-release-button" onClick={() => void releaseGift(gift.id)} disabled={pendingId === gift.id}>
                    {pendingId === gift.id ? "Releasing…" : "Release my reservation"}
                  </button>
                ) : (
                  <span className="gift-reserved-label">Reserved by another shopper</span>
                )}
              </div>
              {confirmingId === gift.id && !gift.reserved ? (
                <div className="gift-confirmation">
                  <p>This marks the gift reserved for other shoppers. The owner editor won&apos;t reveal the reservation.</p>
                  <div>
                    <button type="button" onClick={() => void reserveGift(gift.id)} disabled={pendingId === gift.id}>
                      {pendingId === gift.id ? "Reserving…" : "Yes, reserve it"}
                    </button>
                    <button type="button" onClick={() => setConfirmingId(null)} disabled={pendingId === gift.id}>Cancel</button>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      <p className="gift-privacy-note">Reservations are anonymous. This browser keeps a private token so you can release your own reservation later.</p>
    </section>
  );
}
