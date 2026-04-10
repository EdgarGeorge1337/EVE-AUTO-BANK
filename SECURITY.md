# Security Policy

## Supported Versions

We provide security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not** open a public issue.

Instead, please report it via:
- Email: security@example.com (replace with your contact)
- Private security advisory on GitHub

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Time

We aim to respond to security reports within 48 hours and provide updates on progress.

## Security Features

### Current Security Measures

- **Authentication**: EVE SSO OAuth2
- **Authorization**: Role-based access control (Admin/User)
- **Input Validation**: Zod schemas for all inputs
- **Rate Limiting**: API endpoint protection
- **SQL Injection Protection**: Prisma ORM with parameterized queries
- **Transaction Safety**: Atomic database operations
- **Audit Logging**: Complete audit trail with ESI transaction IDs
- **Error Handling**: Secure error messages (no sensitive data exposure)

### Security Best Practices

1. **Environment Variables**
   - Never commit `.env` files
   - Use strong secrets for `NEXTAUTH_SECRET`
   - Rotate EVE SSO credentials regularly

2. **Database**
   - Use transactions for multi-step operations
   - Validate all inputs before database operations
   - Regular backups recommended

3. **ESI API**
   - Store access tokens securely
   - Implement token refresh logic
   - Monitor rate limits

4. **Deployment**
   - Use HTTPS in production
   - Keep dependencies updated
   - Monitor for security advisories

## Known Security Considerations

### EVE Online Specific

- **ESI Tokens**: Access tokens are stored in database - ensure database is secured
- **Contract Verification**: Always verify contract issuer matches borrower
- **ISK Transfers**: Log all transfers with ESI transaction IDs for audit

### General

- **No Client-Side Secrets**: All sensitive operations server-side only
- **CORS**: Configure appropriately for production
- **Session Management**: NextAuth handles session security

## Updates

Security updates will be released as patch versions (1.0.x) and documented in CHANGELOG.md.

---

**Last Updated**: 2024
