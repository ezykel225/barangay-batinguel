from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, PageBreak)

NAVY  = colors.HexColor('#1e3a8a')
GREEN = colors.HexColor('#15803d')
RED   = colors.HexColor('#991b1b')
GREY  = colors.HexColor('#6b7280')
LINE  = colors.HexColor('#d1d5db')
BAND  = colors.HexColor('#f3f4f6')

ss = getSampleStyleSheet()
H1   = ParagraphStyle('H1', parent=ss['Title'], fontSize=20, textColor=NAVY,
                      spaceAfter=4, alignment=0)
SUB  = ParagraphStyle('SUB', parent=ss['Normal'], fontSize=10, textColor=GREY,
                      spaceAfter=14)
H2   = ParagraphStyle('H2', parent=ss['Heading1'], fontSize=13, textColor=NAVY,
                      spaceBefore=16, spaceAfter=3)
H3   = ParagraphStyle('H3', parent=ss['Heading2'], fontSize=10.5, textColor=GREEN,
                      spaceBefore=11, spaceAfter=3)
BODY = ParagraphStyle('BODY', parent=ss['Normal'], fontSize=9, leading=12.5,
                      spaceAfter=7)
NOTE = ParagraphStyle('NOTE', parent=BODY, fontSize=8.5, textColor=GREY,
                      leading=11.5)
CELL = ParagraphStyle('CELL', parent=ss['Normal'], fontSize=8.2, leading=10.6)
CELLB= ParagraphStyle('CELLB', parent=CELL, fontName='Helvetica-Bold')
HEAD = ParagraphStyle('HEAD', parent=CELL, fontName='Helvetica-Bold',
                      textColor=colors.white)

def P(t, s=CELL):  return Paragraph(t, s)

def table(headers, rows, widths):
    data = [[P(h, HEAD) for h in headers]]
    for r in rows:
        data.append([P(c) if not isinstance(c, Paragraph) else c for c in r])
    t = Table(data, colWidths=widths, repeatRows=1, hAlign='LEFT')
    style = [
        ('BACKGROUND',  (0,0), (-1,0), NAVY),
        ('VALIGN',      (0,0), (-1,-1), 'TOP'),
        ('GRID',        (0,0), (-1,-1), 0.4, LINE),
        ('TOPPADDING',  (0,0), (-1,-1), 5),
        ('BOTTOMPADDING',(0,0),(-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING',(0,0), (-1,-1), 6),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style.append(('BACKGROUND', (0,i), (-1,i), BAND))
    t.setStyle(TableStyle(style))
    return t

# Step / Action / Expected / Result — the last column is left blank to tick.
SAW = [26*mm, 58*mm, 68*mm, 20*mm]
def steps(rows):
    return table(['Step', 'What to do', 'What should happen', 'Pass?'], rows, SAW)

story = []
A = story.append

# ─────────────────────────── cover ───────────────────────────
A(Paragraph('Barangay Batinguel E-System', H1))
A(Paragraph('System testing walkthrough &mdash; every process, by role. '
            'Generated 16 September 2026.', SUB))

A(Paragraph('How to use this', H2))
A(Paragraph(
  'Work down each table in order and tick the last column. Where a step says '
  '<b>should be refused</b>, a refusal <i>is</i> the pass &mdash; those rows test that the '
  'system stops things it ought to stop, and they are the ones worth demonstrating '
  'to a panel. Anything that behaves differently from the middle column is a finding; '
  'note the step number and what happened instead.', BODY))

A(Paragraph('Accounts you need before starting', H2))
A(table(['Role', 'Who', 'Notes'], [
  ['Public visitor', 'No account &mdash; use a private browser window',
   'Tests what an anonymous resident of the barangay can reach.'],
  ['Resident', 'Your own, or a groupmate&rsquo;s',
   'Needs a real email address; signup requires confirming it.'],
  ['Punong Barangay', 'Hon. Frankie Credo',
   'Only this account can change the Kapitan status.'],
  ['Barangay Treasurer', 'Adelina Fabillar Remata',
   'Only this account can approve or decline court reservations.'],
  ['Barangay Secretary', 'Alexis Theress P. Tan',
   'Only this account can act on document requests.'],
  ['Kagawad', 'Any other official',
   'Used to prove the position restrictions actually bite.'],
  ['Nurse', 'The health centre account',
   'Medicines, clinic hours, health events.'],
], [32*mm, 54*mm, 86*mm]))

A(Paragraph(
  '<b>A note on timing.</b> Court bookings can only be made for today or later, and '
  'a slot stays held while it is pending. If a test fails because a slot is taken, '
  'pick a different date rather than assuming the feature is broken.', NOTE))

# ───────────────────────── public ─────────────────────────
A(PageBreak())
A(Paragraph('1. Public visitor (not signed in)', H2))
A(Paragraph('Use a private window so no session is carried over.', BODY))
A(steps([
  ['1.1', 'Open the site&rsquo;s home page',
   'Announcements, events and the waste collection schedule load. Barangay history '
   'and the profile section appear below.', ''],
  ['1.2', 'Check the contact numbers at the bottom of Home and in the footer',
   'Landline (035) 226-2931 and mobile 0919 896 2588. On a phone, tapping either '
   'should start a call.', ''],
  ['1.3', 'Open <b>Officials</b>',
   'All 11 officials appear with photographs &mdash; including Alexis Theress P. Tan '
   'and Nicholas Khyle R. Mondo&ntilde;edo, who previously showed icons.', ''],
  ['1.4', 'Open <b>Health Center</b>',
   'Clinic hours show as two blocks with the lunch break named. Today&rsquo;s row is '
   'marked. Medicine availability is listed by category with an &ldquo;Updated&rdquo; time.', ''],
  ['1.5', 'Between 12:00 NN and 1:00 PM, reload Health Center',
   'A notice reads &ldquo;On lunch break right now&rdquo; and gives the reopening time. '
   'Nobody had to switch this on.', ''],
  ['1.6', 'Open <b>Court Reservation</b> and pick a date',
   'The calendar shows which slots are taken and the activity type for each &mdash; '
   'but never who booked it or why.', ''],
  ['1.7', 'Submit a booking without signing in',
   'Accepted, status pending. This is deliberate: a walk-in has no account.', ''],
  ['1.8', 'Try to reach /official, /nurse or /resident directly',
   '<b>Should be refused</b> &mdash; redirected to the login page.', ''],
]))

# ───────────────────────── resident ─────────────────────────
A(PageBreak())
A(Paragraph('2. Resident', H2))

A(Paragraph('2a. Registration and verification', H3))
A(steps([
  ['2.1', 'Open <b>Sign Up</b>',
   'Separate boxes for first, middle, last name and suffix. Purok is a dropdown, '
   'not a free-text box.', ''],
  ['2.2', 'Try to submit without ticking the residency declaration',
   '<b>Should be refused</b> &mdash; asks you to confirm you live in Barangay Batinguel.', ''],
  ['2.3', 'Complete signup with a real email address',
   'Success message telling you to confirm your email.', ''],
  ['2.4', 'Check the inbox &mdash; <b>and the spam folder</b>',
   'A confirmation email from Barangay Batinguel E-System. First messages from a '
   'new sender very often land in spam.', ''],
  ['2.5', 'Click the confirmation link, then sign in',
   'You land on the <b>home page</b>, not a dashboard. Residents are citizens '
   'browsing a public site, not staff.', ''],
  ['2.6', 'Open your dashboard from the profile pill in the navbar',
   'A banner says the account is pending verification.', ''],
  ['2.7', 'In Settings, upload a valid ID',
   'Uploads. The ID is optional by design &mdash; requiring one would exclude the '
   'residents most likely to need a Certificate of Indigency.', ''],
]))

A(Paragraph('2b. Requesting a document', H3))
A(steps([
  ['2.8', 'While still unverified, try to request a document',
   '<b>Should be refused</b> &mdash; you must be verified first. This is enforced in '
   'the database, not just by hiding the button.', ''],
  ['2.9', 'Have an official verify you (section 3d), then request a document',
   'Accepted. Choose from Barangay Clearance, Barangay Certificate, Certificate of '
   'Indigency, Certificate of Residency, Business Clearance, or Other.', ''],
  ['2.10', 'Watch the request as the Secretary moves it along',
   'Status follows pending &rarr; approved &rarr; ready for pickup &rarr; claimed. '
   'A badge marks changes you have not seen yet.', ''],
]))

A(Paragraph('2c. Court reservations', H3))
A(steps([
  ['2.11', 'Book a slot while signed in',
   'Your details are prefilled. The booking appears under My Reservations.', ''],
  ['2.12', 'Book 8:00 AM for 2 hours, then try 9:00 AM for 1 hour on the same day',
   '<b>Should be refused</b> &mdash; &ldquo;Someone else just booked one of those hours&rdquo;, '
   'and the slot list refreshes. The two overlap even though they start at '
   'different times.', ''],
  ['2.13', 'Try 11:00 AM for 3 hours',
   '<b>Should be refused</b> &mdash; the court closes for lunch, so those hours are not '
   'consecutive.', ''],
  ['2.14', 'Cancel a pending or approved booking for a future date',
   'Asks you to confirm, then releases the slot immediately. Someone else can '
   'book it right away.', ''],
  ['2.15', 'Look for a cancel button on a past booking',
   '<b>Should not be offered</b> &mdash; and the database refuses it even if the request '
   'is sent directly.', ''],
]))

A(Paragraph('2d. Your own details', H3))
A(steps([
  ['2.16', 'In Settings, open <b>My Details</b> and change your purok',
   'Saves. Only puroks within Barangay Batinguel are listed.', ''],
  ['2.17', 'While <b>verified</b>, change your first or last name',
   'A warning appears first. After saving, your account drops back to '
   '<b>pending</b> with a note for the official. <i>This is worth demonstrating.</i>', ''],
  ['2.18', 'Change your profile photo, then check storage',
   'The photo you replaced is deleted rather than left behind.', ''],
  ['2.19', 'Change your password, sign out, sign back in with the new one',
   'Works.', ''],
]))

# ───────────────────────── officials ─────────────────────────
A(PageBreak())
A(Paragraph('3. Officials &mdash; any position', H2))
A(Paragraph('Every official can do these, whatever their position.', BODY))
A(steps([
  ['3.1', 'Sign in as any official',
   'You land on the official dashboard with 13 sections in the sidebar.', ''],
  ['3.2', '<b>Announcements</b> &mdash; add, edit, delete one',
   'Changes appear on the public Home page.', ''],
  ['3.3', '<b>Events</b> &mdash; add, edit, delete one',
   'Appears on the public Events page.', ''],
  ['3.4', '<b>Waste Management</b> &mdash; change a collection day',
   'Updates on the public Home page.', ''],
  ['3.5', '<b>Officials Directory</b> &mdash; add and remove an entry',
   'Updates the public Officials page.', ''],
  ['3.6', '<b>Residents Registry</b> &mdash; add an entry',
   'Note this is the barangay&rsquo;s own record of inhabitants, separate from the '
   'list of people with accounts. Currently sample data.', ''],
  ['3.7', '<b>Reports</b>',
   'Six-month trends, top document types, busiest reservation days.', ''],
  ['3.8', '<b>Activity Log</b>',
   'Every verification, approval, decline and cancellation, with who did it.', ''],
  ['3.9', 'Settings &mdash; change your own profile photo',
   'Updates on the public Officials page. The old photo is deleted.', ''],
]))

A(Paragraph('3d. Resident verification (any official)', H3))
A(steps([
  ['3.10', 'Open <b>Residents</b> and find a pending account',
   'Shows contact, purok, registry match and whether an ID was uploaded.', ''],
  ['3.11', 'Click <b>View ID</b>',
   'The ID opens in a window over the dashboard. The link expires after two '
   'minutes.', ''],
  ['3.12', 'Read the registry match column',
   'Green &ldquo;In registry&rdquo;, amber &ldquo;Similar name&rdquo;, or grey &ldquo;Not in registry&rdquo;. '
   'Grey is a fact to check, not a reason to reject &mdash; the registry is incomplete.', ''],
  ['3.13', 'Click <b>Verify</b>',
   'The resident can now request documents.', ''],
  ['3.14', 'Click <b>Reject</b> on another account',
   'A written reason is required. The resident sees it and can correct their '
   'details and resubmit.', ''],
  ['3.15', 'Click <b>Not a Resident</b>',
   'A written reason is required. The account is permanently ineligible, their '
   'uploaded ID is deleted, and they cannot put themselves back in the queue.', ''],
  ['3.16', 'Sign in as that ineligible person',
   'They can still sign in and read why they were refused &mdash; deliberate, so a '
   'refusal is a message rather than a dead end &mdash; but cannot request anything.', ''],
  ['3.17', 'Click <b>Reinstate</b> on the ineligible account',
   'Recoverable. A mistake by an official does not need a developer to undo.', ''],
]))

A(PageBreak())
A(Paragraph('4. Position-restricted actions', H2))
A(Paragraph(
  'These are the tests worth doing carefully. Officials who lack a permission still '
  '<b>see</b> the data &mdash; the buttons are replaced with a note. That is deliberate, '
  'for transparency.', BODY))

A(Paragraph('4a. Barangay Treasurer only &mdash; court reservations', H3))
A(steps([
  ['4.1', 'As a <b>Kagawad</b>, open Reservations',
   'You can see every booking, but the approve and decline buttons are replaced '
   'with &ldquo;Treasurer only&rdquo;.', ''],
  ['4.2', 'As the <b>Treasurer</b>, approve a pending booking',
   'Approved. The resident sees it, and it is written to the Activity Log under '
   'the Treasurer&rsquo;s name.', ''],
  ['4.3', 'Decline another booking',
   'Declined, and the slot is released for someone else immediately.', ''],
]))

A(Paragraph('4b. Barangay Secretary only &mdash; document requests', H3))
A(steps([
  ['4.4', 'As a <b>Kagawad</b>, open Document Requests',
   'Visible, but the action buttons read &ldquo;Secretary only&rdquo;.', ''],
  ['4.5', 'As the <b>Secretary</b>, approve a request',
   'Approved. The resident&rsquo;s dashboard updates.', ''],
  ['4.6', 'Mark it <b>Ready for Pickup</b>, then <b>Claimed</b>',
   'The resident sees each change. After seven days waiting for pickup, the '
   'reminder turns red.', ''],
]))

A(Paragraph('4c. Punong Barangay only &mdash; Kapitan status', H3))
A(steps([
  ['4.7', 'As any other official, open Kapitan Status',
   'Visible, but not changeable.', ''],
  ['4.8', 'As the <b>Punong Barangay</b>, change the status',
   'Updates on the public Officials page.', ''],
]))

# ───────────────────────── nurse ─────────────────────────
A(PageBreak())
A(Paragraph('5. Nurse', H2))
A(steps([
  ['5.1', 'Sign in as the nurse',
   'The dashboard opens with Medicines, Availability, Health Events and Settings.', ''],
  ['5.2', 'Open <b>Medicines</b>',
   '13 medicines, each with a status of Available, Low stock or Out of stock.', ''],
  ['5.3', 'Tap a different status on any row',
   'Saves immediately &mdash; no dialog. This is the action done daily, so it is one '
   'tap.', ''],
  ['5.4', 'Open the public Health Center page in a private window',
   'The change is visible to an anonymous visitor, and the &ldquo;Updated&rdquo; time has '
   'moved. <i>Worth demonstrating end to end.</i>', ''],
  ['5.5', 'Add a new medicine',
   'Category and form are dropdowns, not free text. The note field is for '
   'residents, e.g. &ldquo;bring your prescription&rdquo;.', ''],
  ['5.6', 'Try to remove a medicine',
   'Prompts you to consider &ldquo;Out of stock&rdquo; instead, so a medicine residents '
   'know about does not simply disappear.', ''],
  ['5.7', '<b>Availability</b> &mdash; edit a day, including the lunch break',
   'Updates the public clinic hours.', ''],
  ['5.8', 'Set your status to <b>On Break</b>',
   'The public page says so. Use this for an unscheduled break; the lunch hour '
   'shows itself automatically from the clock.', ''],
  ['5.9', 'Set a day to <b>On Leave</b>',
   'That day shows as On Leave on the public page.', ''],
  ['5.10', '<b>Health Events</b> &mdash; add one',
   'Appears in the Bakuna calendar on the public Health Center page.', ''],
]))

# ───────────────────── security ─────────────────────
A(PageBreak())
A(Paragraph('6. Things that should fail', H2))
A(Paragraph(
  'These prove the system stops what it ought to stop. Every one is enforced in the '
  'database, so it holds even if someone bypasses the website entirely &mdash; which '
  'anyone can, because the key in the page source is public by design. '
  '<b>The key is not what protects the data; the policies are.</b>', BODY))
A(steps([
  ['6.1', 'As an unverified resident, request a document',
   '<b>Refused.</b> Not just a hidden button &mdash; the database rejects the write.', ''],
  ['6.2', 'As a Kagawad, approve a court reservation',
   '<b>Refused.</b> Treasurer only, enforced by policy.', ''],
  ['6.3', 'As a Kagawad, act on a document request',
   '<b>Refused.</b> Secretary only.', ''],
  ['6.4', 'As a resident, try to cancel someone else&rsquo;s booking',
   '<b>Refused.</b> You can only touch your own.', ''],
  ['6.5', 'Book a court slot that overlaps an existing booking',
   '<b>Refused</b> by a database constraint, not only by the form.', ''],
  ['6.6', 'As an ineligible account, try to return to pending',
   '<b>Refused.</b> Only an official can lift it.', ''],
  ['6.7', 'Change the name on a verified account',
   'Allowed, <b>but</b> verification is withdrawn automatically. A name nobody '
   'checked cannot sit on a verified account.', ''],
  ['6.8', 'Sign up twice with the same email',
   'No second account is created. Note the signup appears to succeed and no email '
   'arrives &mdash; deliberate, so nobody can probe which emails are registered.', ''],
]))

A(Paragraph('7. Known limitations &mdash; not bugs', H2))
A(table(['Area', 'Behaviour', 'Why'], [
  ['SMS notifications',
   'Approving a booking shows &ldquo;could not be sent &mdash; contact the resident directly&rdquo;.',
   'No SMS credits are funded. The approval still succeeds; the system degrades '
   'gracefully rather than failing.'],
  ['Email delivery',
   'Confirmation emails often land in spam.',
   'Gmail SMTP is a development configuration. Production would use a transactional '
   'provider on the barangay&rsquo;s own domain.'],
  ['Residents Registry',
   'Contains sample entries, not real residents.',
   'The real list was not available, and holding it would be hard to justify under '
   'the Data Privacy Act.'],
  ['Purok list',
   'Puroks 1&ndash;7.',
   'Inferred from existing data and still to be confirmed with the barangay.'],
  ['Health centre nurse',
   'Shown as &ldquo;Barangay Health Nurse&rdquo; with no photo.',
   'A role rather than a person. The previous name and photo were not real, and '
   'presenting a stranger as staff is worse than showing no face.'],
], [30*mm, 60*mm, 82*mm]))

A(Spacer(1, 10))
A(Paragraph(
  'Record any step that behaves differently from the middle column, with its number '
  'and what happened instead. A failing step is more useful written down than '
  'remembered.', NOTE))

def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont('Helvetica', 7.5)
    canvas.setFillColor(GREY)
    canvas.drawString(18*mm, 12*mm, 'Barangay Batinguel E-System — testing walkthrough')
    canvas.drawRightString(A4[0] - 18*mm, 12*mm, 'Page %d' % doc.page)
    canvas.setStrokeColor(LINE)
    canvas.line(18*mm, 15*mm, A4[0] - 18*mm, 15*mm)
    canvas.restoreState()

doc = SimpleDocTemplate(
    '/home/user/barangay-batinguel/docs/TESTING-WALKTHROUGH.pdf',
    pagesize=A4, leftMargin=18*mm, rightMargin=18*mm,
    topMargin=16*mm, bottomMargin=20*mm,
    title='Barangay Batinguel E-System — Testing Walkthrough',
    author='Barangay Batinguel E-System')
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print('built')
