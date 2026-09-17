import Decimal from 'decimal.js';

export interface InstalmentData {
  sequenceNumber: number;
  dueDate: Date;
  principalComponent: number;
  interestComponent: number;
  totalDue: number;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const expectedMonth = (d.getMonth() + months) % 12;
  d.setMonth(d.getMonth() + months);
  // Handle end of month overflow (e.g. Jan 31 + 1 month -> Feb 28/29)
  if (d.getMonth() !== (expectedMonth < 0 ? expectedMonth + 12 : expectedMonth)) {
    d.setDate(0);
  }
  return d;
}

export function generateSchedule(
  principal: number,
  annualRate: number,
  tenureMonths: number,
  disbursementDate: Date
): InstalmentData[] {
  const schedule: InstalmentData[] = [];
  
  const r = new Decimal(annualRate).div(100).div(12).div(100);
  const P = new Decimal(principal);
  const n = new Decimal(tenureMonths);

  // EMI = P * r * (1+r)^n / ((1+r)^n - 1)
  const onePlusRToN = new Decimal(1).plus(r).pow(n);
  const emiDecimal = P.times(r).times(onePlusRToN).div(onePlusRToN.minus(1));
  const emi = emiDecimal.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

  let outstandingPrincipal = P;

  for (let i = 1; i <= tenureMonths; i++) {
    const interestComponentDecimal = outstandingPrincipal.times(r);
    const interestComponent = interestComponentDecimal.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
    
    let principalComponent = emi.minus(interestComponent).toNumber();

    if (i === tenureMonths) {
      // remainder absorbed by final instalment
      principalComponent = outstandingPrincipal.toNumber();
    }

    const totalDue = principalComponent + interestComponent;
    
    schedule.push({
      sequenceNumber: i,
      dueDate: addMonths(disbursementDate, i),
      principalComponent,
      interestComponent,
      totalDue
    });

    outstandingPrincipal = outstandingPrincipal.minus(principalComponent);
  }

  return schedule;
}
