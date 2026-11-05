import type { TermsPolicyDocument } from "../types";

/**
 * Client-approved baseline supplied in "DoXa Treasury - Terms and Conditions.pdf".
 * A policy published from the admin dashboard takes precedence over this fallback.
 */
export const APPROVED_TERMS_POLICY: TermsPolicyDocument = {
  slug: "terms",
  status: "published",
  revision: 1,
  title: "Website Terms and Conditions of Use",
  description:
    "The terms that apply when you use the Doxa website, create an account or place an order.",
  version: "1.0",
  effectiveDate: "2026-11-05",
  bodyMarkdown: String.raw`
These Terms are effective as of 5 November 2026.

## 1. About the Website

(a) Welcome to doxatreasury.com (Website). The Website lets you browse and buy the products we offer from time to time, which may include collectible trading cards and printed products (Products). We provide this service by giving you access to the content and purchasing features of the Website (Purchase Services).

(b) The Website is operated by John David Ferrar Chapman trading as DoXa Treasury (ABN 57 919 748 380) (we, us or our). We provide the Website and any related features and services we provide from time to time, including the Purchase Services (together, the Services). Please read these terms and conditions (Terms) carefully. They apply together with our Privacy Policy at doxatreasury.com/policies/privacy (Privacy Policy). If you do not agree with the Terms, you must stop using the Services.

(c) We reserve the right to review and change any of the Terms by updating this page at our sole discretion. When we update the Terms, we will use reasonable endeavours to provide you with notice of updates to the Terms. Any changes to the Terms take immediate effect from the date of their publication. Before you continue, we recommend you keep a copy of the Terms for your records.

## 2. Acceptance of the Terms

You accept the Terms when you create an account, place an order for Products, or click to accept or agree to the Terms where this option is made available to you. If you use the Website without creating an account or placing an order, these Terms are provided as notice of the conditions on which the Website is made available.

## 3. Accounts and use of the Purchase Services

(a) You may browse the Website and purchase Products without creating an account. If you choose to create an account, we collect and hold the following information:

1. your name and email address;
2. a password, or the details needed to sign in through a supported third-party sign-in service;
3. your security settings (including optional two-step verification), sign-in activity and device history, and account preferences;
4. order, shipping and billing details you provide at checkout; and
5. optionally, a phone number for account recovery (providing a phone number is optional, and not providing one does not prevent you from creating or using an account).

(b) You warrant that any information you give to us in the course of creating an account or placing an order will be accurate, correct and up to date.

We collect, use and disclose these details as set out in our Privacy Policy, including for account administration, order processing, product fulfilment, and account security and recovery.

(c) Once you have completed the registration process, you will be a registered member of the Website (Member) and agree to be bound by the Terms. Guest customers may also access and use the Purchase Services to place orders without being Members.

(d) You may not use the Purchase Services and may not accept the Terms if you are a person barred from receiving the Purchase Services under the laws of Australia or other countries including the country in which you are resident or from which you use the Purchase Services.

## 4. Your obligations as a Member

(a) As a Member, you agree to comply with the following: You will use the Purchase Services only for purposes that are permitted by:

1. the Terms;
2. any applicable law, regulation or generally accepted practices or guidelines in the relevant jurisdictions;
3. you have the sole responsibility for protecting the confidentiality of your password and/or email address, as well as any phone number provided for account security recovery. Use of your password by any other person may result in the immediate cancellation of the Purchase Services;
4. any use of your registration information by any other person, or third parties, is strictly prohibited. You agree to immediately notify us of any unauthorised use of your password, email address, or any phone number provided for account security recovery, or any breach of security of which you have become aware;
5. access and use of the Website is limited, non-transferable and allows for the sole use of the Website by you for the purposes of us providing the Purchase Services;
6. you will not use the Purchase Services or Website for any illegal and/or unauthorised use which includes collecting email addresses of Members by electronic or other means for the purpose of sending unsolicited email or unauthorised framing of or linking to the Website;
7. you agree that commercial advertisements, affiliate links, and other forms of solicitation may be removed from the Website without notice and may result in termination of the Purchase Services. Appropriate legal action will be taken by us for any illegal or unauthorised use of the Website; and
8. you acknowledge and agree that any automated use of the Website or its Purchase Services is prohibited, and that we may use security and anti-bot checks to protect the Services.

## 5. Purchase of Products and Returns Policy

(a) In using the Purchase Services to purchase the Product through the Website, you will agree to the payment of the purchase price listed on the Website for the Product (Purchase Price).

(b) You can pay using the payment methods shown at checkout. Payments are processed by our third-party payment processor through a secure hosted checkout (Payment Processor), and we do not receive or store your full card details. Payment of the full Purchase Price is due when you place your order, subject to successful authorisation and processing by the Payment Processor. The Payment Processor's own terms and privacy policy may also apply to your payment.

(c) Following payment of the Purchase Price being confirmed by us, you will be issued with a receipt to confirm that the payment has been received and we may record your purchase details for future use in accordance with our Privacy Policy.

(d) We may, at our sole discretion, provide a refund on the return of the Products within 30 days where the Product packaging is unopened and remains in a saleable condition. Without limiting statutory rights under the Australian Consumer Law, you acknowledge and agree that you are liable for any postage and shipping costs associated with any change-of-mind refund pursuant to this clause.

(e) All prices displayed on the Website are in Australian Dollars (AUD), unless expressly indicated otherwise. GST will be shown where applicable. Prices may change from time to time. The price that applies to your order is the price shown at checkout when you place it. Promotional pricing and discounts are valid only for the stated promotion period and subject to stock availability.

(f) Products, product descriptions, prices and availability may change from time to time. All orders placed through the Website constitute an offer to purchase the specified Products. An order is accepted only when we confirm it by sending you an order confirmation. We reserve the right to accept, reject, or cancel any order (in whole or in part) prior to dispatch, including where Products are unavailable, there is an error in pricing or product description, or payment cannot be processed. If an order is cancelled after payment has been received, a full refund will be issued.

## 6. Delivery

(a) We deliver Products (Delivery Services) using third-party postal and courier companies (Delivery Service Providers).

(b) Delivery Services are provided via third-party postal and courier delivery services. Any delivery timeframes indicated on the Website are estimates only and are not guaranteed, subject to any non-excludable rights you have under the Australian Consumer Law. Nothing in this clause excludes or restricts any statutory consumer rights or guarantees under the Australian Consumer Law. Subject to applicable consumer guarantees, we will not be liable for any delivery delays caused by third-party delivery providers or circumstances beyond reasonable control.

## 7. Warranty

(a) Our Products come with guarantees that cannot be excluded under the Australian Consumer Law. You are entitled to a replacement or refund for a major failure of the Product and compensation for any other reasonably foreseeable loss or damage. You are also entitled to have the Products repaired or replaced if the Products fail to be of acceptable quality and the failure does not amount to a major failure (Consumer Guarantees).

(b) In addition to the Consumer Guarantees, we offer a voluntary warranty against defects in materials and workmanship in the Products for 90 days from the date of purchase (Warranty Period) (Warranty). You may make a claim under the Warranty (Warranty Claim) during the Warranty Period. The Warranty is in addition to, and does not limit, exclude or restrict, your rights under the Australian Consumer Law. You may claim under the Consumer Guarantees whenever they apply, including after the Warranty Period ends.

(c) In order to make a Warranty Claim during the Warranty Period, you must provide proof of purchase to us showing the date of purchase of the Products, provide a description of the Products and the price paid for the Products by sending written notice to us by email at info@doxatreasury.com or through the contact form at doxatreasury.com/contact.

(d) Where a Warranty Claim is accepted, we will repair or replace the defective Products, or refund the price paid, at no cost to you, and reimburse reasonable postage costs where required by the Australian Consumer Law.

(e) Nothing in this clause limits, excludes or replaces any rights, guarantees or remedies available to you under the Australian Consumer Law. Those statutory rights and remedies remain available in addition to the Warranty.

(f) The Warranty does not apply to Products that have been damaged after delivery, misused, subjected to abnormal handling, or altered or modified, except to the extent the damage results from a defect or from our acts or omissions. This does not limit your rights under the Consumer Guarantees.

## 8. Copyright and Intellectual Property

(a) The Website, the Purchase Services and all of our related products are subject to copyright. The material on the Website is protected by copyright under the laws of Australia and through international treaties. Unless otherwise indicated, all rights (including copyright) in the site content and compilation of the website (including text, graphics, logos, button icons, video images, audio clips and software) (Content) are owned or controlled for these purposes, and are reserved by us or our contributors.

(b) We retain all rights, title and interest in and to the Website and all related content. Nothing you do on or in relation to the Website will transfer to you:

1. the business name, trading name, domain name, trade mark, industrial design, patent, registered design or copyright owned by us; or
2. the right to use or exploit a business name, trading name, domain name, trade mark or industrial design; or
3. a system or process that is the subject of a patent, registered design or copyright (or an adaptation or modification of such a system or process).

(c) You may not, without our prior written permission and the permission of any other relevant rights owners: broadcast, republish, up-load to a third party, transmit, post, distribute, show or play in public, adapt or change in any way the Content or third party content for any purpose. Except where permitted by the Copyright Act.

(d) If you give us feedback, survey responses or suggestions about the Services or Products (Feedback), you grant us a non-exclusive, royalty-free, perpetual, worldwide licence to use that Feedback to operate and improve the Services and Products. We handle any personal information in Feedback in accordance with our Privacy Policy.

## 9. Privacy

We take your privacy seriously. Personal information you provide through the Services is handled in accordance with our Privacy Policy at doxatreasury.com/policies/privacy. We share it only as described there, including with third-party service providers (such as payment processors, hosting, authentication, security and email service providers). The Website uses cookies and similar technologies, such as browser storage for your cart and sign-in, and security and anti-bot checks. We only send you marketing with your consent, and you can opt out at any time using the unsubscribe link or your account settings.

## 10. General Disclaimer

(a) You acknowledge that we do not make any terms, guarantees, warranties, representations or conditions whatsoever regarding the Products other than provided for pursuant to these Terms.

(b) We will make every effort to ensure a Product is accurately depicted on the Website, however, you acknowledge that sizes, colours and packaging may differ from what is displayed on the Website.

(c) Nothing in these Terms limits or excludes any guarantees, warranties, representations, conditions, rights or remedies implied or imposed by law, including the Australian Consumer Law (or any liability under them) which by law may not be limited or excluded, and any limitation or exclusion of liability in these Terms operates only to the extent permitted by law.

(d) Subject to this clause, and to the extent permitted by law:

1. only terms, guarantees, warranties, representations or conditions that may lawfully be excluded are excluded; and
2. we will, to the extent permitted by law and subject to clause 10(c), not be liable for any special, indirect or consequential loss or damage (unless such loss or damage is reasonably foreseeable resulting from our failure to meet an applicable Consumer Guarantee), loss of profit or opportunity, or damage to goodwill arising out of or in connection with the Purchase Services or these Terms (including as a result of not being able to use the Purchase Services or the late supply of the Purchase Services), whether at common law, under contract, tort (including negligence), in equity, pursuant to statute or otherwise.

(e) To the extent permitted by law and subject to clause 10(c), use of the Website, the Purchase Services, and any of our Products (including the Delivery Services), is at your own risk. Everything on the Website, the Purchase Services, and our Products, are provided to you on an "as is" and "as available" basis, without warranty or condition of any kind, provided that nothing in this clause limits, excludes or restricts any consumer guarantees, rights or remedies under the Australian Consumer Law. None of our affiliates, directors, officers, employees, agents, contributors, third party content providers or licensors (including any third party where the Delivery Services are made available to you) make any express or implied representation or warranty about its Content or any products or Purchase Services (including our products or Purchase Services) referred to on the Website. This includes (but is not restricted to) loss or damage you might suffer as a result of any of the following:

1. failure of performance, error, omission, interruption, deletion, defect, failure to correct defects, delay in operation or transmission, computer virus or other harmful component, loss of data, communication line failure, unlawful third party conduct, or theft, destruction, alteration or unauthorised access to records;
2. the accuracy, suitability or currency of any information on the Website, the Purchase Service, or any of its Content related products (including third party material and advertisements on the Website);
3. costs incurred as a result of you using the Website, the Purchase Services or any of the Products;
4. the Content or operation in respect to links which are provided for the User's convenience;
5. any failure to complete a transaction, or any loss arising from e-commerce transacted on the Website; or
6. any defamatory, threatening, offensive or unlawful conduct of third parties or publication of any materials relating to or constituting such conduct.

## 11. Limitation of Liability

(a) Nothing in these Terms excludes, restricts or modifies any right or remedy, or any guarantee, warranty or other term, that cannot lawfully be excluded, restricted or modified, including under the Australian Consumer Law. Subject to those non-excludable rights and remedies and to the extent permitted by law, our total liability arising out of or in connection with the Purchase Services or these Terms, however arising, will not exceed the most recent Purchase Price paid by you under these Terms. This cap does not apply to any liability that cannot lawfully be limited or excluded.

(b) To the extent permitted by law, and subject always to clause 10(c), we and the other persons listed in clause 10(e) are not liable for indirect or consequential loss, loss of profit, loss of goodwill or other intangible loss arising from use of the Website or Purchase Services. This exclusion does not apply to any loss or liability that cannot lawfully be excluded or limited, including any rights or remedies under the Australian Consumer Law.

(c) We are not responsible or liable in any manner for any site content (including the Content and Third Party Content) posted on the Website or in connection with the Purchase Services, whether posted or caused by users of the Website, by third parties or by any of the Purchase Services offered by us.

(d) You acknowledge that we do not provide the Delivery Services to you and you agree that, subject to clause 10(c) and your rights under the Australian Consumer Law, we will not be liable to you for any special, indirect or consequential loss or damage, loss of profit or opportunity, or damage to goodwill arising out of or in connection with the Delivery Services.

## 12. Termination of Contract

(a) The Terms will continue to apply until terminated by either you or us as set out below.

(b) If you want to terminate the Terms, you may do so by:

1. notifying us at any time; or
2. closing your account, which you can do at any time through your account settings or by contacting us. Information connected with a closed account is handled as set out in our Privacy Policy.

(c) Your notice should be sent, in writing, to us by email to info@doxatreasury.com or through the contact form at doxatreasury.com/contact.

(d) We may at any time terminate the Terms with you if:

1. you have breached any provision of the Terms or intend to breach any provision;
2. we are required to do so by law;
3. we are transitioning to no longer providing the Purchase Services to Users in the country in which you are resident or from which you use the service; or
4. the provision of the Purchase Services to you by us is, in our opinion, no longer commercially viable.

(e) Subject to local applicable laws, we reserve the right to discontinue or cancel your membership to the Website at any time and may suspend or deny, in our sole discretion, your access to all or any portion of the Website or the Purchase Services without notice if you breach any provision of the Terms or any applicable law or if your conduct impacts our name or reputation or violates the rights of those of another party.

(f) When the Terms come to an end, all of the legal rights, obligations and liabilities that you and we have benefited from, been subject to (or which have accrued over time whilst the Terms have been in force) or which are expressed to continue indefinitely, shall be unaffected by this cessation, and the provisions of this clause shall continue to apply to such rights, obligations and liabilities indefinitely.

## 13. Indemnity

(a) You are liable to us only for direct losses, liabilities and reasonable legal costs (on an ordinary basis) to the extent directly caused by your proven material breach of these Terms or your unlawful conduct, including infringement of another person's rights. You do not indemnify us for ordinary access to or use of the Website, or for losses caused by us or another person. Any indemnity under this clause is subject to applicable law and does not exclude, restrict or modify any non-excludable rights or remedies, including under the Australian Consumer Law.

## 14. Dispute Resolution

If a dispute arises out of or relates to these Terms, the parties are encouraged to first contact each other and attempt to resolve the dispute informally and in good faith. A party may commence Tribunal or Court proceedings at any time, and nothing in this clause requires prior negotiation or mediation or restricts urgent relief or any statutory consumer rights or remedies.

### 14.1 Notice

If you wish to raise a dispute, you are encouraged to contact us by email at info@doxatreasury.com or through the contact form at doxatreasury.com/contact with a brief description of the issue and your preferred resolution. We will make reasonable efforts to respond and resolve the issue promptly. Direct contact is encouraged to assist in achieving a practical resolution, but it is not a condition of pursuing any complaint, statutory right, Tribunal or Court proceeding. A party may also provide written notice to the other party detailing the nature of the dispute, the desired outcome and any action requested to settle the dispute.

### 14.2 Voluntary Mediation

If a dispute is not resolved informally, the parties may mutually agree to attempt to resolve the dispute by voluntary mediation. Mediation is strictly voluntary. If the parties agree to mediate, the mediator, the mediation format (including whether conducted online or in person) and the allocation of mediation costs must be agreed by the parties in writing before mediation commences. Neither party is required to mediate, attend mediation in Sydney, pay equal costs, or wait any fixed period before commencing Tribunal or Court proceedings.

The parties may agree in writing to use a mediator, including by telephone or videoconference, and must agree the mediator, location or remote format, and allocation of costs before mediation begins. If they do not agree, either party may proceed to a Tribunal or Court.

### 14.3 Confidential

All communications concerning negotiations and voluntary mediation proceedings made by the parties arising out of and in connection with this dispute resolution clause are confidential and, to the extent possible, must be treated as "without prejudice" negotiations for the purpose of applicable laws of evidence.

### 14.4 Termination of Mediation

Where the parties have agreed to participate in voluntary mediation, either party may terminate the mediation process at any time by written notice to the other party and the mediator.

## 15. Venue and Jurisdiction

The Purchase Services are intended for residents of Australia. You and we submit to the non-exclusive jurisdiction of the courts and tribunals of New South Wales, Australia. Nothing in this clause prevents you from bringing a claim in any other court or tribunal that has jurisdiction, including a consumer tribunal in your State or Territory.

## 16. Governing Law

The Terms are governed by the laws of New South Wales, Australia. Any dispute, controversy, proceeding or claim of whatever nature arising out of or in any way relating to the Terms and the rights created hereby shall be governed, interpreted and construed by, under and pursuant to the laws of New South Wales, Australia, without reference to conflict of law principles. Nothing in this clause excludes, restricts or modifies any rights, guarantees or remedies that apply to you under the Australian Consumer Law or any other mandatory consumer protection law, regardless of the governing law chosen in these Terms. The Terms shall be binding to the benefit of the parties hereto and their successors and assigns.

## 17. Severance

If any part of these Terms is found to be void or unenforceable by a Court of competent jurisdiction, that part shall be severed and the rest of the Terms shall remain in force.

## 18. Entire Agreement, Variation and Waiver

These Terms constitute the entire agreement between the parties in relation to their subject matter and supersede all prior discussions, representations, or agreements. We reserve the right to vary these Terms in accordance with clause 1(c). No failure or delay by a party in exercising any right or remedy under these Terms shall operate as a waiver of that right or remedy. Neither party may assign or transfer its rights or obligations under these Terms without the prior written consent of the other party, except that we may assign these Terms in connection with a reorganisation or transfer of its business.
`.trim(),
};
