-- Seed data: 15 realistic feedback items from various sources

INSERT INTO feedback (source, source_id, author, content, created_at, urgency, sentiment, category) VALUES

-- Discord feedback
('discord', 'msg_892341', 'devops_dan', 'Workers has been absolutely amazing for our edge computing needs. Migrated our entire auth layer and latency dropped by 60%. Huge win for our team!', '2024-01-15 09:23:00', 'low', 'positive', 'praise'),

('discord', 'msg_892456', 'sarah_builds', 'Is there any way to increase the CPU time limit for Workers? We have some heavy JSON parsing that keeps hitting the 50ms limit. Would pay more for higher limits.', '2024-01-15 11:45:00', 'medium', 'neutral', 'feature_request'),

('discord', 'msg_892512', 'frustrated_dev42', 'Third time this week my Worker randomly returns 1101 errors. No changes on my end. This is affecting production and my boss is asking questions. Need help ASAP.', '2024-01-15 14:32:00', 'critical', 'negative', 'bug'),

-- Twitter feedback
('twitter', 'tw_18823912', '@cloudninja', 'just spent 4 hours debugging why my @CloudflareDev Worker wasn''t reading headers correctly. Turns out I needed to use request.headers.get() not request.headers[]. Maybe docs could be clearer? 😅', '2024-01-14 16:20:00', 'low', 'neutral', 'question'),

('twitter', 'tw_18824501', '@startupfounder', 'Shoutout to @CloudflareDev - switched from Lambda@Edge and our monthly bill went from $3400 to $89. Not a typo. The pricing model actually makes sense.', '2024-01-14 19:05:00', 'low', 'positive', 'praise'),

('twitter', 'tw_18825102', '@webperf_matters', '@CloudflareDev D1 is not ready for production. Lost data twice during "maintenance windows" that weren''t announced. How is this acceptable?', '2024-01-15 08:12:00', 'critical', 'negative', 'complaint'),

('twitter', 'tw_18825234', '@indie_hacker_jo', 'Anyone else getting random 522 errors on Workers? Started about 2 hours ago. @CloudflareDev status page shows all green which is frustrating', '2024-01-15 13:44:00', 'high', 'negative', 'bug'),

-- GitHub feedback
('github', 'issue_4521', 'mjohnson-dev', '[Feature Request] Add native support for WebSocket hibernation in Durable Objects. Current workaround of using alarms is clunky and expensive for high-connection-count applications.', '2024-01-13 10:30:00', 'medium', 'neutral', 'feature_request'),

('github', 'issue_4532', 'enterprise_architect', 'D1 read replication across regions would be a game-changer for our globally distributed app. Currently seeing 200ms+ latency for users far from primary region. Is this on the roadmap?', '2024-01-14 14:22:00', 'medium', 'neutral', 'feature_request'),

('github', 'issue_4538', 'security_researcher_x', 'Potential security concern: Workers KV namespace list operation returns keys that were deleted within the last 60 seconds. Could leak sensitive key names in certain scenarios. Happy to provide more details privately.', '2024-01-15 07:15:00', 'high', 'neutral', 'bug'),

('github', 'pr_comment_8921', 'contributor_alice', 'The new wrangler dev improvements are fantastic. Hot reload is so much faster now. Great work team! 🎉', '2024-01-15 11:00:00', 'low', 'positive', 'praise'),

-- Support tickets
('support', 'ticket_78234', 'enterprise_client_a', 'We are on Enterprise plan and experiencing consistent 30% increase in P99 latency since last Tuesday. This is impacting our SLAs with our own customers. Attached graphs showing the regression. Need immediate escalation.', '2024-01-14 08:45:00', 'critical', 'negative', 'bug'),

('support', 'ticket_78256', 'small_biz_owner', 'Hi, I''m new to Workers and trying to understand the billing. If I have 10 million requests but they''re all from the same user refreshing a page, do I get charged for all 10 million? Seems like a lot. Thanks!', '2024-01-14 15:30:00', 'low', 'neutral', 'question'),

('support', 'ticket_78271', 'agency_dev_lead', 'We need to deploy the same Worker to 50+ zones for different clients. Current process is manual and error-prone. Is there a bulk deployment API or Terraform provider that supports this? Would significantly improve our workflow.', '2024-01-15 09:00:00', 'medium', 'neutral', 'feature_request'),

('support', 'ticket_78289', 'angry_customer_99', 'YOUR SERVICE DELETED MY ENTIRE KV NAMESPACE. I did NOT click delete. There is NO undo button. Two years of data GONE. I am consulting with my lawyer about damages. This is completely unacceptable.', '2024-01-15 12:18:00', 'critical', 'negative', 'complaint');
