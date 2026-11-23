export async function inspectForms(page) {
  return await page.locator('form[data-type="add-to-cart-form"]').evaluateAll(forms => forms.map(f => {
    const button = f.querySelector('button[name="add"]');
    const variant = f.querySelector('input[name="id"]');
    return { productId: f.querySelector('input[name="product-id"]')?.value,
      variantId: variant?.value, variantDisabled: !variant || variant.disabled,
      label: button?.textContent?.trim() ?? "", buttonDisabled: !button || button.disabled || button.getAttribute("aria-disabled") === "true",
      visible: !!button && button.getClientRects().length > 0 };
  }));
}
