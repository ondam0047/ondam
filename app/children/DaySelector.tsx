"use client";

import { useState } from "react";
import { WEEK } from "@/lib/constants";

export default function DaySelector({ initial }: { initial: number[] }) {
  const [days, setDays] = useState<number[]>(initial);

  function toggle(i: number) {
    setDays((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i].sort()
    );
  }

  return (
    <>
      <div className="daypick">
        {WEEK.map((w, i) => {
          const on = days.includes(i);
          return (
            <div
              key={w}
              className={"daychip" + (on ? " on" : "") + (i === 0 ? " sun" : "")}
              onClick={() => toggle(i)}
            >{w}</div>
          );
        })}
      </div>
      <input type="hidden" name="defaultDays" value={days.join(",")} />
    </>
  );
}
