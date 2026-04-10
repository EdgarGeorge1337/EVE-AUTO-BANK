# Contributing to EVE Auto Bank

Thank you for your interest in contributing to EVE Auto Bank! This document provides guidelines and instructions for contributing.

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help maintain a positive community

## Development Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/your-username/eve-auto-bank.git
   cd eve-auto-bank
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Setup Database**
   ```bash
   npm run db:generate
   npm run db:push
   ```

4. **Configure Environment**
   - Copy `.env.example` to `.env.local`
   - Add your EVE SSO credentials

5. **Start Development Server**
   ```bash
   npm run dev
   ```

## Coding Standards

### TypeScript
- Use TypeScript for all new code
- Avoid `any` types - use proper type definitions
- Follow existing code style
- Run `npm run type-check` before committing

### Code Style
- Use 2 spaces for indentation
- Use semicolons
- Use single quotes for strings
- Follow ESLint configuration
- Run `npm run format` before committing

### Best Practices
- **Transactions**: Always use `db.$transaction()` for multi-step database operations
- **Error Handling**: Use try-catch blocks and proper error logging
- **Validation**: Use Zod schemas for input validation
- **Logging**: Use the logger utility (`src/lib/logger.ts`), not console.log
- **Security**: Verify admin roles, validate inputs, use rate limiting

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add manual contract matching
fix: resolve transaction atomicity issue
docs: update README with setup instructions
refactor: improve error handling in ESI client
test: add unit tests for accounting functions
chore: update dependencies
```

### Commit Types
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

## Pull Request Process

1. **Create a Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Changes**
   - Write clean, documented code
   - Add tests if applicable
   - Update documentation
   - Follow coding standards

3. **Test Your Changes**
   ```bash
   npm run lint
   npm run type-check
   npm run format:check
   npm run build
   ```

4. **Submit Pull Request**
   - Provide clear description
   - Reference related issues
   - Ensure all checks pass
   - Update CHANGELOG.md if needed

## Semantic Versioning

This project follows [Semantic Versioning](https://semver.org/):

- **MAJOR** (1.0.0): Breaking changes
- **MINOR** (0.1.0): New features, backwards compatible
- **PATCH** (0.0.1): Bug fixes, backwards compatible

## Areas for Contribution

### High Priority
- Unit tests for core functions
- Integration tests for API routes
- Environment variable validation
- Health check endpoint
- Performance monitoring

### Medium Priority
- Additional loan term options
- Risk-based interest rates
- Client-side error reporting
- API documentation (OpenAPI)
- Additional ESI endpoints

### Documentation
- Code comments and JSDoc
- API endpoint documentation
- Setup guides
- Troubleshooting guides

## Questions?

Open an issue for questions or discussions about contributions.

---

Thank you for contributing! 🚀
