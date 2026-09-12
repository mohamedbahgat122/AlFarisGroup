export type DriverResignation = {
  id: string;
  organizationId: string;
  driverId: string;
  keetaDriverId: string | null;
  newKeetaDriverId: string | null;
  resignationDate: string;
  ordersCount: number;
  rating: "A" | "B" | "C" | "D";
  notes: string | null;
  isSettled: boolean;
  settledAt: string | null;
  settledBy: { id: string; fullName: string } | null;
  createdBy: { id: string; fullName: string } | null;
  createdAt: string;
  updatedAt: string;
  driver: {
    fullName: string;
    iqamaNumber: string;
    mobileNumber: string;
  };
};

export type DriverResignationListResponse = {
  items: DriverResignation[];
  total: number;
  hasMore: boolean;
};

export type SimpleDriver = {
  id: string;
  fullName: string;
  iqamaNumber: string;
  keetaDriverId: string | null;
};
