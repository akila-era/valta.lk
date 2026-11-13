# VOLTA AI: reviewer guide (Sinhala, Singlish and mixed language)

You are helping check how well a shopping assistant for an electronics store in Sri Lanka understands customers. You do not need any technical knowledge. Please work alone, do not discuss your answers with other reviewers until you are asked to, and do not look anything up in the assistant.

**What we are asking:** to judge short sample messages and the assistant's fixed Sinhala replies. We are not testing you.

**Privacy:** the messages are made-up examples. Please do not write real names, phone numbers, addresses, order numbers or any personal information anywhere in your answers.

## What you will receive

1. `review-messages.csv`: 318 sample messages. Open it in Excel or Google Sheets (UTF-8, so Sinhala displays correctly).
2. `review-sinhala-templates.csv`: the replies the assistant gives in Sinhala.
3. Later, a request to write fresh messages of your own (Task C).

## Task A: the messages (about 2 to 3 hours)

For every row, fill the blank columns:

| Column | What to write |
|---|---|
| `R1_is_natural` | **yes** if a real Sri Lankan shopper could write this. **awkward** if it is understandable but strange or stiff. **no** if nobody would write it or it is wrong |
| `R2_label_correct` | **yes** if the `expected_label` correctly says what the shopper wants. **no** if it does not |
| `R3_better_label_if_no` | If you wrote "no", the label you think is right (see the list below) |
| `R4_more_natural_wording` | Optional: how a shopper would more naturally say it |
| `R5_notes` | Optional: anything useful, such as "can mean two things" |

The labels (what the shopper wants):

| Label | Meaning | Example (not from the file) |
|---|---|---|
| search_products | Find or browse products | "Show me phones under 80,000" |
| get_product_details | Details, price or features of a product | "How big is the screen?" |
| compare_products | Compare two products | "Which of these two is better?" |
| check_stock | Is it available now? | "Is it still in stock?" |
| get_accessories | Cases, chargers, cables that fit | "Is there a charger for it?" |
| cart_add / cart_remove / cart_update_quantity / cart_view | Add to, remove from, change the number in, or look at the shopping cart | "Add this to my cart" |
| order_status | Where is my order, track it | "Where is my parcel?" |
| order_support | Change or cancel an order, a problem with an order | "I want to cancel my order" |
| checkout_handoff | Wants to pay or check out | "I'm ready to pay" |
| store_info | Delivery charge and similar store questions | "How much is delivery?" |
| website_policy | Warranty or return rules | "Can I return it?" |
| smalltalk | Hello, thanks, goodbye, "who are you" | "Thank you" |
| general | A request that is not about the shop at all (writing, explaining, school questions) | "Explain how a fridge works" |
| external_site | Asks the assistant to use another website or Google | "Check the price on another site" |
| ambiguous | Too vague to act on: the assistant should ask a question | "That one" |

If a message could reasonably have two labels, choose the closer one and mention the other in the notes.

## Task B: the Sinhala replies (about 1 hour)

For each reply: does it mean the same as the English source (`R1`), does it sound natural (`R2`: yes, no or awkward), is it polite in the way a shop should be (`R3`), how you would write it (`R4`), and notes (`R5`). The replies are written for a shop assistant: friendly and clear, not too formal and not slangy.

## Task C: write your own messages (the independent test, about 3 hours)

Do this **before** you see anyone else's work, and without trying to match the sample file. For each label above, write at least **15 messages** in each of four forms:
1. Sinhala script,
2. Singlish (Sinhala written in English letters, the way people text),
3. Sinhala and English mixed in one sentence,
4. English.

Write the way real shoppers write: short and long, polite and casual, with the spelling mistakes and shortcuts people really make. Put each message in its own row with its label. Do not make up product names that look like real brands, and do not include personal information.

## Returning your work

Save your files with your reviewer id (initials or a code we give you) in the file name, for example `RV1_review-messages.csv`. Send the files privately. Please keep UTF-8 encoding when you save.

## If you are unsure

Write "awkward" or add a note rather than guessing silently. A note that says "this could mean X or Y" is valuable.
