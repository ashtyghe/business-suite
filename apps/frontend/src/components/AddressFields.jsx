import { AU_STATES } from "../utils/helpers";
import s from "./AddressFields.module.css";

export default function AddressFields({ values, onChange, id = "addr" }) {
  return (
    <>
      <div className={s.field}>
        <label className={s.label}>Address</label>
        <input value={values.address || ""} onChange={e => onChange("address", e.target.value)} className={s.input} placeholder="Street address" autoComplete="off" />
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
