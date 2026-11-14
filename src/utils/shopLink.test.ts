import { describe, expect, it } from 'vitest';
import { shopLinkLabel } from './shopLink';

describe('shopLinkLabel', () => {
  it('names an Amazon search, an Amazon product and any other store one way each', () => {
    expect(shopLinkLabel('search', 'https://www.amazon.com/s?k=M3+screw')).toBe('Find on Amazon');
    expect(shopLinkLabel('product', 'https://www.amazon.com/dp/B0G39SM9HZ')).toBe('Buy on Amazon');
    expect(shopLinkLabel('product', 'https://www.amazon.com/s?k=STS3215')).toBe('Find on Amazon');
    expect(shopLinkLabel('product', 'https://www.amazon.com/s/ref=nb_sb_noss?k=STS3215')).toBe('Find on Amazon');
    expect(shopLinkLabel('product', 'https://www.amazon.com/sspa/click')).toBe('Buy on Amazon');
    expect(shopLinkLabel('product', 'https://www.adafruit.com/product/4754')).toBe('Open Listing');
    expect(shopLinkLabel('product', 'not a link')).toBe('Open Listing');
  });
});
