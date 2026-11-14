import { describe, expect, it } from 'vitest';
import { checkedOrigin, placeText, readPlace } from './earthOrigin';

const CITY_HALL = { lat: 37.7792808, lon: -122.4192363, altitudeM: null };

describe('readPlace', () => {
  it('gives the same origin for a pasted Maps link and plain coordinates', () => {
    const links = [
      'https://www.google.com/maps/place/San+Francisco+City+Hall/@37.7792,-122.4215,17z/data=!3m1!4b1!4m6!3m5!1s0x808580:0x2!8m2!3d37.7792808!4d-122.4192363!16s',
      'google.com/maps/search/?api=1&query=37.7792808,-122.4192363',
      'https://maps.google.com/?q=37.7792808,-122.4192363',
      'https://www.google.co.uk/maps/@37.7792808,-122.4192363,19z',
    ];

    expect(readPlace('37.7792808, -122.4192363')).toEqual(CITY_HALL);

    for (const link of links) expect(readPlace(link)).toEqual(CITY_HALL);
  });

  it('reads hemispheres, spaces and an altitude', () => {
    expect(readPlace('37.7792808° N, 122.4192363° W')).toEqual(CITY_HALL);
    expect(readPlace('-33.8568 151.2153')).toEqual({ lat: -33.8568, lon: 151.2153, altitudeM: null });
    expect(readPlace('37.7792808, -122.4192363, 16.5')).toEqual({ ...CITY_HALL, altitudeM: 16.5 });
  });

  it('refuses what isn’t a place on Earth', () => {
    const refused = [
      '',
      'San Francisco',
      '91, 10',
      '10, 181',
      '37.7, -122.4, 99999',
      'https://maps.app.goo.gl/abc123',
      'https://attacker.example/maps/@37.7,-122.4,17z',
      'https://www.google.com/search?q=37.7,-122.4',
    ];

    for (const text of refused) expect(readPlace(text)).toBeNull();
  });

  it('writes a place back the way it reads', () => {
    const place = { lat: 37.7792808, lon: -122.4192363, altitudeM: 16.5 };

    expect(readPlace(placeText(place))).toEqual(place);
  });
});

describe('checkedOrigin', () => {
  it('keeps a saved origin and drops anything a crafted scene could add', () => {
    const saved = { ...CITY_HALL, offsetM: 1.5, hidden: true, extra: 'x' };

    expect(checkedOrigin(saved)).toEqual({ ...CITY_HALL, offsetM: 1.5, hidden: true });
    expect(checkedOrigin({ ...CITY_HALL, offsetM: Number.NaN })).toBeNull();
    expect(checkedOrigin({ ...CITY_HALL, lat: 120, offsetM: 0 })).toBeNull();
    expect(checkedOrigin({ ...CITY_HALL, offsetM: 5000 })).toBeNull();
    expect(checkedOrigin('37.7, -122.4')).toBeNull();
  });
});
