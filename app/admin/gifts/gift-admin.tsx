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
  priority: 3,
  note: "",
  active: true,
};

const priorityOptions = [1, 2, 3, 4, 5] as const;
const priceFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function priorityLabel(priority: number) {
  if (priority === 1) return "Priority 1 — highest";
  if (priority === 5) return "Priority 5 — lowest";
  return `Priority ${priority}`;
}

function retailerName(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Retailer";
  }
}

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

function GiftEditorFields({ lookupKey, draft, state, onChange, onInspect }: {
  lookupKey: string;
  draft: EditableGift;
  state?: LookupState;
  onChange: (change: Partial<EditableGift>) => void;
  onInspect: () => void;
}) {
  return (
    <div className="gift-editor-form">
      <label className="gift-field gift-field-wide"><span>Gift name</span><input required minLength={2} maxLength={120} value={draft.title} onChange={(event) => onChange({ title: event.target.value })} placeholder="e.g. Audeze Maxwell 2 headset" /></label>
      <ProductLookup lookupKey={lookupKey} draft={draft} state={state} onChange={onChange} onInspect={onInspect} />
      <label className="gift-field"><span>Price</span><div className="gift-price-input"><b>$</b><input inputMode="decimal" min="0" step="0.01" type="number" value={draft.price} onChange={(event) => onChange({ price: event.target.value })} placeholder="0.00" /></div></label>
      <label className="gift-field"><span>Priority</span><select value={draft.priority} onChange={(event) => onChange({ priority: Number(event.target.value) })}>{priorityOptions.map((priority) => <option value={priority} key={priority}>{priorityLabel(priority)}</option>)}</select></label>
      <label className="gift-field gift-field-wide"><span>Notes</span><textarea maxLength={500} value={draft.note} onChange={(event) => onChange({ note: event.target.value })} placeholder="Color, size, model, or anything else that matters" /></label>
    </div>
  );
}

export function GiftAdmin() {
  const [gifts, setGifts] = useState<GiftDraft[]>([]);
  const [newGift, setNewGift] = useState<EditableGift>(emptyGift);
  const [lookups, setLookups] = useState<Record<string, LookupState>>({});
  const [loading, setLoading] = useState(true);
  const [editorKey, setEditorKey] = useState<string | null>(null);
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
      setEditorKey(null);
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
      setEditorKey(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Gift idea could not be saved");
    } finally {
      setPendingId(null);
    }
  }

  const editingGift = editorKey && editorKey !== "new"
    ? gifts.find((gift) => gift.id === editorKey)
    : undefined;

  function closeEditor() {
    if (editorKey === "new") {
      setNewGift(emptyGift);
      setLookups((current) => ({ ...current, new: {} }));
    } else if (editorKey) {
      void loadGifts();
    }
    setEditorKey(null);
    setError(null);
  }

  return (
    <div className="gift-admin">
      <nav className="gift-admin-bar" aria-label="Owner sections"><a href="/admin">Owner dashboard</a><a className="gift-admin-bar-active" href="/admin/gifts" aria-current="page">Gifts</a><a href="/gifts" target="_blank" rel="noreferrer">Open public list</a></nav>

      <section className="gift-admin-existing" aria-labelledby="gift-existing-heading">
        <div className="gift-admin-section-heading">
          <div><p className="section-kicker">Gift editor</p><h2 id="gift-existing-heading">Your current list.</h2></div>
          <div className="gift-admin-heading-actions">
            <p>Reservations stay hidden here so the surprise remains intact.</p>
            <button type="button" onClick={() => { setNewGift(emptyGift); setEditorKey("new"); setError(null); setNotice(null); }}>Add New</button>
          </div>
        </div>

        <div className="gift-admin-feedback" aria-live="polite">{error ? <p className="gift-inline-error" role="alert">{error}</p> : null}{notice ? <p className="gift-inline-success">{notice}</p> : null}</div>
        {loading ? <div className="gift-loading"><span /> Reading gift ideas…</div> : null}
        {!loading && !gifts.length ? <div className="gift-empty-state"><p>No gift ideas yet.</p><button type="button" onClick={() => setEditorKey("new")}>Add the first one</button></div> : null}

        <div className="gift-admin-card-grid">
          {gifts.map((gift) => (
            <article className={`gift-card gift-admin-card${!gift.active ? " gift-admin-card-hidden" : ""}`} key={gift.id}>
              <div className="gift-card-topline">
                <span className={`gift-priority gift-priority-${gift.priority}`}>Priority {gift.priority}</span>
                <span>{gift.active ? retailerName(gift.url) : `Hidden · ${retailerName(gift.url)}`}</span>
              </div>
              {gift.imageUrl ? (
                <a className="gift-card-image" href={gift.url} target="_blank" rel="noreferrer" aria-label={`View ${gift.title} at the retailer`}>
                  {/* Retailer image hosts are arbitrary, so they cannot use a fixed Next Image allowlist. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={gift.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                </a>
              ) : <div className="gift-card-image-placeholder">No image selected</div>}
              <div className="gift-card-copy">
                <h3>{gift.title}</h3>
                {gift.note ? <p className="gift-note">{gift.note}</p> : null}
                <p className="gift-price">{gift.price ? priceFormatter.format(Number(gift.price)) : "Price varies"}</p>
              </div>
              <div className="gift-card-actions">
                <button type="button" onClick={() => { setEditorKey(gift.id); setError(null); setNotice(null); }}>Edit</button>
                <a href={gift.url} target="_blank" rel="noreferrer">View at retailer</a>
              </div>
            </article>
          ))}
        </div>
      </section>

      {editorKey === "new" ? (
        <div className="gift-admin-modal" role="presentation">
          <section className="gift-admin-dialog" role="dialog" aria-modal="true" aria-labelledby="gift-create-heading">
            <div className="gift-admin-dialog-heading">
              <div><p className="section-kicker">New gift</p><h2 id="gift-create-heading">Add from any retailer.</h2></div>
              <button type="button" onClick={closeEditor} aria-label="Close gift editor">Close</button>
            </div>
            <form onSubmit={createGift}>
              <GiftEditorFields lookupKey="new" draft={newGift} state={lookups.new} onChange={(change) => setNewGift((current) => ({ ...current, ...change }))} onInspect={() => void inspectLink("new", newGift)} />
              <div className="gift-editor-footer">
                <label className="gift-visibility-toggle"><input type="checkbox" checked={newGift.active} onChange={(event) => setNewGift((current) => ({ ...current, active: event.target.checked }))} /><span>Show on /gifts</span></label>
                <div><button className="gift-editor-cancel" type="button" onClick={closeEditor}>Cancel</button><button type="submit" disabled={pendingId === "new"}>{pendingId === "new" ? "Adding…" : "Add gift idea"}</button></div>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {editingGift ? (
        <div className="gift-admin-modal" role="presentation">
          <section className="gift-admin-dialog" role="dialog" aria-modal="true" aria-labelledby="gift-edit-heading">
            <div className="gift-admin-dialog-heading">
              <div><p className="section-kicker">Edit gift</p><h2 id="gift-edit-heading">{editingGift.title}</h2></div>
              <button type="button" onClick={closeEditor} aria-label="Close gift editor">Close</button>
            </div>
            <form onSubmit={(event) => { event.preventDefault(); void saveGift(editingGift); }}>
              <GiftEditorFields lookupKey={editingGift.id} draft={editingGift} state={lookups[editingGift.id]} onChange={(change) => updateDraft(editingGift.id, change)} onInspect={() => void inspectLink(editingGift.id, editingGift)} />
              <div className="gift-editor-footer">
                <label className="gift-visibility-toggle"><input type="checkbox" checked={editingGift.active} onChange={(event) => updateDraft(editingGift.id, { active: event.target.checked })} /><span>Show on /gifts</span></label>
                <div><a href={editingGift.url} target="_blank" rel="noreferrer">Check retailer link</a><button className="gift-editor-cancel" type="button" onClick={closeEditor}>Cancel</button><button type="submit" disabled={pendingId === editingGift.id}>{pendingId === editingGift.id ? "Saving…" : "Save changes"}</button></div>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
