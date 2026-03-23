import { useState, useEffect, useRef } from "react";
import { AU_STATES } from "../utils/helpers";
import s from "./AddressFields.module.css";

let _googleMapsPromise = null;
const loadGoogleMapsScript = () => {
  if (_googleMapsPromise) return _googleMapsPromise;
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!key) return Promise.resolve(null);
  if (window.google?.maps?.places) return Promise.resolve(window.google);
  _googleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`;
    script.async = true;
    script.onload = () => resolve(window.google);
    script.onerror = () => { _googleMapsPromise = null; reject(new Error("Failed to load Google Maps")); };
    document.head.appendChild(script);
  });
  return _googleMapsPromise;
};

const parseGooglePlace = (place) => {
  const get = (type, form = "long_name") => {
    const c = place.address_components?.find(c => c.types.includes(type));
    return c ? c[form] : "";
  };
  const streetNumber = get("street_number");
  const route = get("route");
  return {
    address: [streetNumber, route].filter(Boolean).join(" "),
    suburb: get("locality") || get("sublocality_level_1"),
    state: get("administrative_area_level_1", "short_name"),
    postcode: get("postal_code"),
  };
};

export default function AddressFields({ values, onChange, id = "addr" }) {
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    loadGoogleMapsScript().then(google => {
      if (!google || !mounted || !inputRef.current || autocompleteRef.current) return;
      const ac = new google.maps.places.Autocomplete(inputRef.current, {
        types: ["address"],
        componentRestrictions: { country: "au" },
        fields: ["address_components"],
      });
      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        if (!place.address_components) return;
        const parsed = parseGooglePlace(place);
        onChange("address", parsed.address);
        onChange("suburb", parsed.suburb);
        onChange("state", parsed.state);
        onChange("postcode", parsed.postcode);
      });
      autocompleteRef.current = ac;
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  return (
    <>
      <div className={s.field}>
        <label className={s.label}>Address</label>
        <input ref={inputRef} value={values.address || ""} onChange={e => onChange("address", e.target.value)} className={s.input} placeholder="Start typing to search..." autoComplete="off" />
      </div>
      <div className={s.row}>
        <div className={s.field}>
          <label className={s.label}>Suburb</label>
          <input value={values.suburb || ""} onChange={e => onChange("suburb", e.target.value)} className={s.input} />
        </div>
        <div className={s.stateField}>
          <label className={s.label}>State</label>
          <select value={values.state || ""} onChange={e => onChange("state", e.target.value)} className={s.select}>
            <option value="">—</option>
            {AU_STATES.map(st => <option key={st} value={st}>{st}</option>)}
          </select>
        </div>
        <div className={s.postcodeField}>
          <label className={s.label}>Postcode</label>
          <input value={values.postcode || ""} onChange={e => onChange("postcode", e.target.value)} className={s.input} maxLength={4} />
        </div>
      </div>
    </>
  );
}
