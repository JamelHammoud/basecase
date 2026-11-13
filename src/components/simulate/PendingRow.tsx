import React from 'react';

export const PendingRow: React.FC = () => (
  <div className="h-[46px] flex flex-col justify-center gap-2">
    <span className="block skeleton-line shimmer h-[9px] w-2/3" />
    <span className="block skeleton-line shimmer h-[7px] w-1/2" />
  </div>
);
