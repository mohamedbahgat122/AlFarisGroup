import { z } from "zod";

export const addDriverResignationSchema = z.object({
  driverId: z.string().uuid("Invalid driver ID"),
  resignationDate: z.string().min(1, "Date is required"),
  ordersCount: z.number().int().min(0, "Orders count must be 0 or more"),
  rating: z.enum(["A", "B", "C", "D"], {
    error: "Rating is required and must be A, B, C, or D"
  }),
  notes: z.string().optional().nullable(),
  newKeetaDriverId: z.string().optional().nullable(),
});

export type AddDriverResignationInput = z.infer<typeof addDriverResignationSchema>;

export const updateDriverResignationSchema = z.object({
  resignationDate: z.string().min(1, "Date is required"),
  ordersCount: z.number().int().min(0, "Orders count must be 0 or more"),
  rating: z.enum(["A", "B", "C", "D"], {
    error: "Rating is required and must be A, B, C, or D"
  }),
  notes: z.string().optional().nullable(),
  newKeetaDriverId: z.string().optional().nullable(),
});

export type UpdateDriverResignationInput = z.infer<typeof updateDriverResignationSchema>;
