"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type Gift = {
  id: string;
  title: string;
  url: string;
  priceCents: number | null;
  priority: number;
  note: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type GiftDraft = Omit<Gift, "priceCents"> & { price: string };

const emptyGift = {
  title: "",
  url: "",
  price: "",
  priority: 2,
  note: "",
  active: true,
};

function toDraft(gift: Gift): GiftDraft {
  return {
    ...gift,
    price: gift.priceCents === null ? "" : (gift.priceCents / 100).toFixed(2),
  };
}

function priceToCents(value: string) {
  if (!value.trim()) return null;
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? Math.round(price * 100) : undefined;
}

function giftPayload(gift: Pick<GiftDraft, "title" | "url" | "price" | "priority" | "note" | "active">) {
  const priceCents = priceToCents(gift.price);
  if (priceCents === undefined) throw new Error("Enter a valid price or leave it blank");
  return {
    title: gift.title,
    url: gift.url,
    priceCents,
    priority: gift.priority,
    note: gift.note,
    active: gift.active,
  };
}

async function fetchAdminGifts() {
  const response = await fetch("/admin/api/gifts", { cache: "no-store" });
  const body = await response.json() as { gifts?: Gift[]; error?: string };
  if (!response.ok || !body.gifts) throw new Error(body.error || "Gift ideas could not be loaded");
  return body.gifts.map(toDraft);
}

export function GiftAdmin() {
  const [gifts, setGifts] = useState<GiftDraft[]>([]);
  const [newGift, setNewGift] = useState(emptyGift);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadGifts = useCallback(async () => {
    setError(null);
    try {
      setGifts(await fetchAdminGifts());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Gift ideas could not be loaded");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchAdminGifts()
      .then((nextGifts) => { if (!cancelled) setGifts(nextGifts); })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Gift ideas could not be loaded");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function createGift(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingId("new");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/admin/api/gifts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(giftPayload(newGift)),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Gift idea could not be added");
      setNewGift(emptyGift);
      setNotice("Gift idea added to the list.");
      await loadGifts();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Gift idea could not be added");
    } finally {
      setPendingId(null);
    }
  }

  function updateDraft(id: string, change: Partial<GiftDraft>) {
    setGifts((current) => current.map((gift) => gift.id === id ? { ...gift, ...change } : gift));
  }

  async function saveGift(gift: GiftDraft) {
    setPendingId(gift.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/admin/api/gifts/${gift.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(giftPayload(gift)),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Gift idea could not be saved");
      setNotice(`${gift.title} saved.`);
      await loadGifts();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Gift idea could not be saved");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="gift-admin">
      <nav className="gift-admin-bar" aria-label="Gift registry links">
        <a href="/admin">Owner dashboard</a>
        <a href="/gifts" target="_blank" rel="noreferrer">Open public list</a>
      </nav>

      <section className="gift-admin-create" aria-labelledby="gift-create-heading">
        <div className="gift-admin-section-heading">
          <div><p className="section-kicker">New idea</p><h2 id="gift-create-heading">Add from any retailer.</h2></div>
          <p>Title and link are required. Price and notes can stay blank.</p>
        </div>
        <form onSubmit={createGift} className="gift-editor-form">
          <label className="gift-field gift-field-wide"><span>Gift name</span><input required minLength={2} maxLength={120} value={newGift.title} onChange={(event) => setNewGift({ ...newGift, title: event.target.value })} placeholder="e.g. Sony WH-1000XM6 headphones" /></label>
          <label className="gift-field gift-field-wide"><span>Retailer link</span><input required type="url" maxLength={2048} value={newGift.url} onChange={(event) => setNewGift({ ...newGift, url: event.target.value })} placeholder="https://…" /></label>
          <label className="gift-field"><span>Price</span><div className="gift-price-input"><b>$</b><input inputMode="decimal" min="0" step="0.01" type="number" value={newGift.price} onChange={(event) => setNewGift({ ...newGift, price: event.target.value })} placeholder="0.00" /></div></label>
          <label className="gift-field"><span>Priority</span><select value={newGift.priority} onChange={(event) => setNewGift({ ...newGift, priority: Number(event.target.value) })}><option value={3}>Most wanted</option><option value={2}>Would love</option><option value={1}>Nice to have</option></select></label>
          <label className="gift-field gift-field-wide"><span>Notes</span><textarea maxLength={500} value={newGift.note} onChange={(event) => setNewGift({ ...newGift, note: event.target.value })} placeholder="Color, size, model, or anything else that matters" /></label>
          <button className="gift-admin-primary" type="submit" disabled={pendingId === "new"}>{pendingId === "new" ? "Adding…" : "Add gift idea"}</button>
        </form>
      </section>

      <div className="gift-admin-feedback" aria-live="polite">
        {error ? <p className="gift-inline-error" role="alert">{error}</p> : null}
        {notice ? <p className="gift-inline-success">{notice}</p> : null}
      </div>

      <section className="gift-admin-existing" aria-labelledby="gift-existing-heading">
        <div className="gift-admin-section-heading">
          <div><p className="section-kicker">Current list</p><h2 id="gift-existing-heading">Edit what shoppers see.</h2></div>
          <p>Reservations stay hidden here so the surprise remains intact.</p>
        </div>
        {loading ? <div className="gift-loading"><span /> Reading gift ideas…</div> : null}
        {!loading && !gifts.length ? <div className="gift-empty-state"><p>No gift ideas yet.</p></div> : null}
        <div className="gift-admin-list">
          {gifts.map((gift) => (
            <article className={!gift.active ? "gift-editor-hidden" : undefined} key={gift.id}>
              <div className="gift-editor-title-row">
                <strong>{gift.title || "Untitled gift"}</strong>
                <span>{gift.active ? "Published" : "Hidden"}</span>
              </div>
              <div className="gift-editor-form">
                <label className="gift-field gift-field-wide"><span>Gift name</span><input required minLength={2} maxLength={120} value={gift.title} onChange={(event) => updateDraft(gift.id, { title: event.target.value })} /></label>
                <label className="gift-field gift-field-wide"><span>Retailer link</span><input required type="url" maxLength={2048} value={gift.url} onChange={(event) => updateDraft(gift.id, { url: event.target.value })} /></label>
                <label className="gift-field"><span>Price</span><div className="gift-price-input"><b>$</b><input inputMode="decimal" min="0" step="0.01" type="number" value={gift.price} onChange={(event) => updateDraft(gift.id, { price: event.target.value })} placeholder="0.00" /></div></label>
                <label className="gift-field"><span>Priority</span><select value={gift.priority} onChange={(event) => updateDraft(gift.id, { priority: Number(event.target.value) })}><option value={3}>Most wanted</option><option value={2}>Would love</option><option value={1}>Nice to have</option></select></label>
                <label className="gift-field gift-field-wide"><span>Notes</span><textarea maxLength={500} value={gift.note} onChange={(event) => updateDraft(gift.id, { note: event.target.value })} /></label>
              </div>
              <div className="gift-editor-footer">
                <label className="gift-visibility-toggle"><input type="checkbox" checked={gift.active} onChange={(event) => updateDraft(gift.id, { active: event.target.checked })} /><span>Show on /gifts</span></label>
                <div><a href={gift.url} target="_blank" rel="noreferrer">Check retailer link</a><button type="button" onClick={() => void saveGift(gift)} disabled={pendingId === gift.id}>{pendingId === gift.id ? "Saving…" : "Save changes"}</button></div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
