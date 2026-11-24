"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type Gift = {
  id: string;
  title: string;
  url: string;
  imageUrl: string | null;
  priceCents: number | null;
  priority: number;
  note: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type EditableGift = {
  title: string;
  url: string;
  imageUrl: string;
  price: string;
  priority: number;
  note: string;
  active: boolean;
};

type GiftDraft = Omit<Gift, "imageUrl" | "priceCents"> & EditableGift;

type ProductInspection = {
  requestedUrl: string;
  finalUrl: string;
  retailer: string;
  titles: Array<{ value: string; source: string }>;
  images: Array<{ url: string; source: string; label?: string }>;
  prices: Array<{ amount: string; currency: string; priceCents: number | null; source: string; label: string }>;
  warning?: string;
};

type LookupState = {
  pending?: boolean;
  error?: string;
  inspection?: ProductInspection;
};

const emptyGift: EditableGift = {
  title: "",
  url: "",
  imageUrl: "",
  price: "",
  priority: 2,
  note: "",
  active: true,
};

function toDraft(gift: Gift): GiftDraft {
  return {
    ...gift,
    imageUrl: gift.imageUrl ?? "",
    price: gift.priceCents === null ? "" : (gift.priceCents / 100).toFixed(2),
  };
}

function priceToCents(value: string) {
  if (!value.trim()) return null;
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? Math.round(price * 100) : undefined;
}

function giftPayload(gift: EditableGift) {
  const priceCents = priceToCents(gift.price);
  if (priceCents === undefined) throw new Error("Enter a valid price or leave it blank");
  return {
    title: gift.title,
    url: gift.url,
    imageUrl: gift.imageUrl.trim() || null,
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

function ProductLookup({ lookupKey, draft, state, onChange, onInspect }: {
  lookupKey: string;
  draft: EditableGift;
  state?: LookupState;
  onChange: (change: Partial<EditableGift>) => void;
  onInspect: () => void;
}) {
  const inspection = state?.inspection;
  return (
    <>
      <div className="gift-field gift-field-wide">
        <label htmlFor={`gift-url-${lookupKey}`}>Retailer link</label>
        <div className="gift-link-tools">
          <input id={`gift-url-${lookupKey}`} required type="url" maxLength={2048} value={draft.url} onChange={(event) => onChange({ url: event.target.value })} placeholder="https://…" />
          <button type="button" onClick={onInspect} disabled={state?.pending || !draft.url.trim()}>
            {state?.pending ? "Pulling details…" : "Pull product details"}
          </button>
        </div>
        <small>Best effort: some retailers, especially Amazon, may block automatic lookup.</small>
      </div>

      {state?.error ? <p className="gift-lookup-error gift-field-wide" role="alert">{state.error}</p> : null}

      {inspection ? (
        <section className="gift-product-picker gift-field-wide" aria-label="Product detail suggestions">
          <div className="gift-product-picker-heading">
            <div><span>Suggestions from</span><strong>{inspection.retailer}</strong></div>
            <a href={inspection.finalUrl} target="_blank" rel="noreferrer">Open inspected page</a>
          </div>

          {inspection.warning ? <p className="gift-lookup-note">{inspection.warning}</p> : null}

          {inspection.titles.length ? (
            <div className="gift-suggestion-group">
              <span>Possible product names</span>
              <div className="gift-title-options">
                {inspection.titles.map((candidate) => (
                  <button type="button" key={`${candidate.source}-${candidate.value}`} onClick={() => onChange({ title: candidate.value })}>
                    {candidate.value}<small>{candidate.source}</small>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {inspection.images.length ? (
            <div className="gift-suggestion-group">
              <span>Choose the image to show</span>
              <div className="gift-image-options">
                {inspection.images.map((candidate, index) => (
                  <button type="button" key={candidate.url} className={draft.imageUrl === candidate.url ? "gift-option-selected" : undefined} aria-pressed={draft.imageUrl === candidate.url} onClick={() => onChange({ imageUrl: candidate.url })}>
                    {/* Retailer image hosts are arbitrary, so they cannot use a fixed Next Image allowlist. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={candidate.url} alt={candidate.label || `Product image option ${index + 1}`} loading="lazy" referrerPolicy="no-referrer" />
                    <small>{candidate.source}</small>
                  </button>
                ))}
                <button type="button" className={!draft.imageUrl ? "gift-option-selected gift-no-image-option" : "gift-no-image-option"} aria-pressed={!draft.imageUrl} onClick={() => onChange({ imageUrl: "" })}>No image</button>
              </div>
            </div>
          ) : null}

          {inspection.prices.length ? (
            <div className="gift-suggestion-group">
              <span>Choose the current price</span>
              <div className="gift-price-options">
                {inspection.prices.map((candidate) => {
                  const selectable = candidate.currency === "USD" && candidate.priceCents !== null;
                  const selected = selectable && draft.price === (candidate.priceCents! / 100).toFixed(2);
                  return (
                    <button type="button" key={`${candidate.currency}-${candidate.amount}`} className={selected ? "gift-option-selected" : undefined} disabled={!selectable} aria-pressed={selected} title={selectable ? `Use ${candidate.label}` : "Only USD prices can fill this list's price field"} onClick={() => selectable && onChange({ price: (candidate.priceCents! / 100).toFixed(2) })}>
                      <strong>{candidate.currency} {candidate.amount}</strong><small>{candidate.label}</small>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <label className="gift-field gift-field-wide"><span>Selected image link</span><input type="url" maxLength={2048} value={draft.imageUrl} onChange={(event) => onChange({ imageUrl: event.target.value })} placeholder="Choose a suggestion above or paste an image URL" /></label>
    </>
  );
}

export function GiftAdmin() {
  const [gifts, setGifts] = useState<GiftDraft[]>([]);
  const [newGift, setNewGift] = useState<EditableGift>(emptyGift);
  const [lookups, setLookups] = useState<Record<string, LookupState>>({});
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
      .catch((loadError: unknown) => { if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Gift ideas could not be loaded"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function updateDraft(id: string, change: Partial<EditableGift>) {
    setGifts((current) => current.map((gift) => gift.id === id ? { ...gift, ...change } : gift));
  }

  async function inspectLink(lookupKey: string, draft: EditableGift) {
    setLookups((current) => ({ ...current, [lookupKey]: { pending: true } }));
    try {
      const response = await fetch("/admin/api/gifts/inspect-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: draft.url }),
      });
      const body = await response.json() as { inspection?: ProductInspection; error?: string };
      if (!response.ok || !body.inspection) throw new Error(body.error || "Product details could not be pulled");
      const inspection = body.inspection;
      setLookups((current) => ({ ...current, [lookupKey]: { inspection } }));
      const firstUsdPrice = inspection.prices.find((candidate) => candidate.currency === "USD" && candidate.priceCents !== null);
      const suggested: Partial<EditableGift> = {
        ...(!draft.title.trim() && inspection.titles[0] ? { title: inspection.titles[0].value } : {}),
        ...(!draft.imageUrl.trim() && inspection.images[0] ? { imageUrl: inspection.images[0].url } : {}),
        ...(!draft.price.trim() && firstUsdPrice ? { price: (firstUsdPrice.priceCents! / 100).toFixed(2) } : {}),
      };
      if (lookupKey === "new") setNewGift((current) => ({ ...current, ...suggested }));
      else updateDraft(lookupKey, suggested);
    } catch (lookupError) {
      setLookups((current) => ({ ...current, [lookupKey]: { error: lookupError instanceof Error ? lookupError.message : "Product details could not be pulled" } }));
    }
  }

  async function createGift(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingId("new");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/admin/api/gifts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(giftPayload(newGift)) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Gift idea could not be added");
      setNewGift(emptyGift);
      setLookups((current) => ({ ...current, new: {} }));
      setNotice("Gift idea added to the list.");
      await loadGifts();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Gift idea could not be added");
    } finally {
      setPendingId(null);
    }
  }

  async function saveGift(gift: GiftDraft) {
    setPendingId(gift.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/admin/api/gifts/${gift.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(giftPayload(gift)) });
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
      <nav className="gift-admin-bar" aria-label="Gift registry links"><a href="/admin">Owner dashboard</a><a href="/gifts" target="_blank" rel="noreferrer">Open public list</a></nav>

      <section className="gift-admin-create" aria-labelledby="gift-create-heading">
        <div className="gift-admin-section-heading"><div><p className="section-kicker">New idea</p><h2 id="gift-create-heading">Add from any retailer.</h2></div><p>Paste a product link, pull its details, then choose the right image and price.</p></div>
        <form onSubmit={createGift} className="gift-editor-form">
          <label className="gift-field gift-field-wide"><span>Gift name</span><input required minLength={2} maxLength={120} value={newGift.title} onChange={(event) => setNewGift({ ...newGift, title: event.target.value })} placeholder="e.g. Audeze Maxwell 2 headset" /></label>
          <ProductLookup lookupKey="new" draft={newGift} state={lookups.new} onChange={(change) => setNewGift((current) => ({ ...current, ...change }))} onInspect={() => void inspectLink("new", newGift)} />
          <label className="gift-field"><span>Price</span><div className="gift-price-input"><b>$</b><input inputMode="decimal" min="0" step="0.01" type="number" value={newGift.price} onChange={(event) => setNewGift({ ...newGift, price: event.target.value })} placeholder="0.00" /></div></label>
          <label className="gift-field"><span>Priority</span><select value={newGift.priority} onChange={(event) => setNewGift({ ...newGift, priority: Number(event.target.value) })}><option value={3}>Most wanted</option><option value={2}>Would love</option><option value={1}>Nice to have</option></select></label>
          <label className="gift-field gift-field-wide"><span>Notes</span><textarea maxLength={500} value={newGift.note} onChange={(event) => setNewGift({ ...newGift, note: event.target.value })} placeholder="Color, size, model, or anything else that matters" /></label>
          <button className="gift-admin-primary" type="submit" disabled={pendingId === "new"}>{pendingId === "new" ? "Adding…" : "Add gift idea"}</button>
        </form>
      </section>

      <div className="gift-admin-feedback" aria-live="polite">{error ? <p className="gift-inline-error" role="alert">{error}</p> : null}{notice ? <p className="gift-inline-success">{notice}</p> : null}</div>

      <section className="gift-admin-existing" aria-labelledby="gift-existing-heading">
        <div className="gift-admin-section-heading"><div><p className="section-kicker">Current list</p><h2 id="gift-existing-heading">Edit what shoppers see.</h2></div><p>Reservations stay hidden here so the surprise remains intact.</p></div>
        {loading ? <div className="gift-loading"><span /> Reading gift ideas…</div> : null}
        {!loading && !gifts.length ? <div className="gift-empty-state"><p>No gift ideas yet.</p></div> : null}
        <div className="gift-admin-list">
          {gifts.map((gift) => (
            <article className={!gift.active ? "gift-editor-hidden" : undefined} key={gift.id}>
              <div className="gift-editor-title-row"><strong>{gift.title || "Untitled gift"}</strong><span>{gift.active ? "Published" : "Hidden"}</span></div>
              <div className="gift-editor-form">
                <label className="gift-field gift-field-wide"><span>Gift name</span><input required minLength={2} maxLength={120} value={gift.title} onChange={(event) => updateDraft(gift.id, { title: event.target.value })} /></label>
                <ProductLookup lookupKey={gift.id} draft={gift} state={lookups[gift.id]} onChange={(change) => updateDraft(gift.id, change)} onInspect={() => void inspectLink(gift.id, gift)} />
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
