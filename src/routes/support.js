import express from 'express';
import { authenticateToken, requireSupport } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabase.js';

const router = express.Router();

/**
 * @route   GET /api/support/tickets
 * @desc    Get user's tickets
 * @access  Private
 */
router.get('/tickets', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { status } = req.query; // optional filter: 'open', 'closed', etc.

        let query = supabaseAdmin
            .from('support_tickets')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        // Filter by status if provided
        if (status) {
            if (status === 'open') {
                query = query.in('status', ['open', 'in_progress']);
            } else if (status === 'closed') {
                query = query.in('status', ['resolved', 'closed']);
            } else {
                query = query.eq('status', status);
            }
        }

        const { data: tickets, error } = await query;

        if (error) {
            console.error('Error fetching tickets:', error);
            return res.status(500).json({
                error: 'Failed to fetch tickets',
                message: 'An error occurred while retrieving your support tickets'
            });
        }

        // Format tickets for frontend
        const formattedTickets = tickets.map(ticket => ({
            id: ticket.id,
            title: ticket.title,
            description: ticket.description,
            status: ticket.status,
            priority: ticket.priority,
            messages: ticket.messages || [],
            createdAt: ticket.created_at,
            updatedAt: ticket.updated_at
        }));

        res.status(200).json({
            tickets: formattedTickets,
            count: formattedTickets.length
        });

    } catch (error) {
        console.error('Error in get tickets route:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'An error occurred while processing your request'
        });
    }
});

/**
 * @route   POST /api/support/tickets
 * @desc    Create new ticket
 * @access  Private
 */
router.post('/tickets', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { title, description, priority = 'medium' } = req.body;

        // Validate required fields
        if (!title || !description) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'Title and description are required'
            });
        }

        // Validate priority
        const validPriorities = ['low', 'medium', 'high', 'urgent'];
        if (!validPriorities.includes(priority)) {
            return res.status(400).json({
                error: 'Invalid priority',
                message: 'Priority must be one of: low, medium, high, urgent'
            });
        }

        // Create initial message
        const initialMessage = {
            user_id: userId,
            message: description,
            timestamp: new Date().toISOString(),
            attachments: [],
            is_internal: false
        };

        // Create ticket
        const { data: ticket, error } = await supabaseAdmin
            .from('support_tickets')
            .insert({
                user_id: userId,
                title: title.trim(),
                description: description.trim(),
                priority,
                status: 'open',
                messages: [initialMessage]
            })
            .select('*')
            .single();

        if (error) {
            console.error('Error creating ticket:', error);
            return res.status(500).json({
                error: 'Failed to create ticket',
                message: 'An error occurred while creating your support ticket'
            });
        }

        // Format response
        const formattedTicket = {
            id: ticket.id,
            title: ticket.title,
            description: ticket.description,
            status: ticket.status,
            priority: ticket.priority,
            messages: ticket.messages || [],
            createdAt: ticket.created_at,
            updatedAt: ticket.updated_at
        };

        res.status(201).json({
            message: 'Support ticket created successfully',
            ticket: formattedTicket
        });

    } catch (error) {
        console.error('Error in create ticket route:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'An error occurred while processing your request'
        });
    }
});

/**
 * @route   GET /api/support/tickets/:id
 * @desc    Get ticket details
 * @access  Private
 */
router.get('/tickets/:id', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const ticketId = req.params.id;

        const { data: ticket, error } = await supabaseAdmin
            .from('support_tickets')
            .select('*')
            .eq('id', ticketId)
            .eq('user_id', userId) // Ensure user can only access their own tickets
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({
                    error: 'Ticket not found',
                    message: 'The requested support ticket was not found'
                });
            }
            console.error('Error fetching ticket:', error);
            return res.status(500).json({
                error: 'Failed to fetch ticket',
                message: 'An error occurred while retrieving the support ticket'
            });
        }

        // Format ticket for frontend
        const formattedTicket = {
            id: ticket.id,
            title: ticket.title,
            description: ticket.description,
            status: ticket.status,
            priority: ticket.priority,
            messages: ticket.messages || [],
            createdAt: ticket.created_at,
            updatedAt: ticket.updated_at
        };

        res.status(200).json({
            ticket: formattedTicket
        });

    } catch (error) {
        console.error('Error in get ticket details route:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'An error occurred while processing your request'
        });
    }
});

/**
 * @route   PATCH /api/support/tickets/:id/close
 * @desc    Close a ticket
 * @access  Private
 */
router.patch('/tickets/:id/close', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const ticketId = req.params.id;

        // Get current ticket to verify ownership
        const { data: currentTicket, error: fetchError } = await supabaseAdmin
            .from('support_tickets')
            .select('*')
            .eq('id', ticketId)
            .eq('user_id', userId)
            .single();

        if (fetchError) {
            if (fetchError.code === 'PGRST116') {
                return res.status(404).json({
                    error: 'Ticket not found',
                    message: 'The requested support ticket was not found'
                });
            }
            console.error('Error fetching ticket for closing:', fetchError);
            return res.status(500).json({
                error: 'Failed to fetch ticket',
                message: 'An error occurred while retrieving the support ticket'
            });
        }

        // Check if ticket is already closed
        if (['resolved', 'closed'].includes(currentTicket.status)) {
            return res.status(400).json({
                error: 'Ticket already closed',
                message: 'This ticket is already closed or resolved'
            });
        }

        // Update ticket status to closed
        const { data: updatedTicket, error: updateError } = await supabaseAdmin
            .from('support_tickets')
            .update({
                status: 'closed',
                updated_at: new Date().toISOString()
            })
            .eq('id', ticketId)
            .select('*')
            .single();

        if (updateError) {
            console.error('Error closing ticket:', updateError);
            return res.status(500).json({
                error: 'Failed to close ticket',
                message: 'An error occurred while closing the ticket'
            });
        }

        // Format response
        const formattedTicket = {
            id: updatedTicket.id,
            title: updatedTicket.title,
            description: updatedTicket.description,
            status: updatedTicket.status,
            priority: updatedTicket.priority,
            messages: updatedTicket.messages || [],
            createdAt: updatedTicket.created_at,
            updatedAt: updatedTicket.updated_at
        };

        res.status(200).json({
            message: 'Ticket closed successfully',
            ticket: formattedTicket
        });

    } catch (error) {
        console.error('Error in close ticket route:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'An error occurred while processing your request'
        });
    }
});

/**
 * @route   PUT /api/support/tickets/:id
 * @desc    Add message to ticket
 * @access  Private
 */
router.put('/tickets/:id', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const ticketId = req.params.id;
        const { message } = req.body;

        // Validate message
        if (!message || !message.trim()) {
            return res.status(400).json({
                error: 'Missing message',
                message: 'Message content is required'
            });
        }

        // Get current ticket
        const { data: currentTicket, error: fetchError } = await supabaseAdmin
            .from('support_tickets')
            .select('*')
            .eq('id', ticketId)
            .eq('user_id', userId)
            .single();

        if (fetchError) {
            if (fetchError.code === 'PGRST116') {
                return res.status(404).json({
                    error: 'Ticket not found',
                    message: 'The requested support ticket was not found'
                });
            }
            console.error('Error fetching ticket for update:', fetchError);
            return res.status(500).json({
                error: 'Failed to fetch ticket',
                message: 'An error occurred while retrieving the support ticket'
            });
        }

        // Create new message
        const newMessage = {
            user_id: userId,
            message: message.trim(),
            timestamp: new Date().toISOString(),
            attachments: [],
            is_internal: false
        };

        // Add message to existing messages
        const updatedMessages = [...(currentTicket.messages || []), newMessage];

        // Update ticket with new message and set status to open if it was closed
        const updateData = {
            messages: updatedMessages,
            updated_at: new Date().toISOString()
        };

        // If ticket was closed/resolved, reopen it when user adds a message
        if (['resolved', 'closed'].includes(currentTicket.status)) {
            updateData.status = 'open';
        }

        const { data: updatedTicket, error: updateError } = await supabaseAdmin
            .from('support_tickets')
            .update(updateData)
            .eq('id', ticketId)
            .select('*')
            .single();

        if (updateError) {
            console.error('Error updating ticket:', updateError);
            return res.status(500).json({
                error: 'Failed to update ticket',
                message: 'An error occurred while adding your message'
            });
        }

        // Format response
        const formattedTicket = {
            id: updatedTicket.id,
            title: updatedTicket.title,
            description: updatedTicket.description,
            status: updatedTicket.status,
            priority: updatedTicket.priority,
            messages: updatedTicket.messages || [],
            createdAt: updatedTicket.created_at,
            updatedAt: updatedTicket.updated_at
        };

        res.status(200).json({
            message: 'Message added successfully',
            ticket: formattedTicket
        });

    } catch (error) {
        console.error('Error in update ticket route:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'An error occurred while processing your request'
        });
    }
});

export default router;
