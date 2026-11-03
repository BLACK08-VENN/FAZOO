# Airtel ISP maintenance case study

This is an unaffiliated, fictional demonstration at `/maintenance-preview/airtel`
on the combined `feature/fazoo-expansion` preview branch. No actual Airtel sites,
customers, employees, outages, network access or supplier orders are involved.

Five simulated jobs demonstrate customer connection diagnosis, an urgent fibre
link fault, backup power completion review, scheduled router inspection and a
replacement router awaiting parts. Addresses are fictional and map pins are null.
The shared maintenance simulator provides request creation, priority filters,
optional user-entered location pins, assignment/deadlines, technician updates,
parts delays/resumption, completion submission and independent role-based review.
Role switching demonstrates the workflow; it is not authentication. Refresh and
Reset demo return this scenario to its own Airtel seed rather than generic jobs.
The Hanan retail demo and the generic maintenance demo retain their own data.

The hub and shared preview navigation link to both company cases. The page is
available only on credential-free Vercel preview deployments. No hosted schema,
main branch, production app or live company tenant is changed. No Hanan or Airtel
logo or real personal/network information is seeded.

Three scenario checks cover valid ISP sample jobs without GPS pins, parts-delay
resumption through technician submission and manager approval, and reset isolation.
