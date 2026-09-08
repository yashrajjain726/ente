use std::sync::{Mutex, MutexGuard, PoisonError};

use super::{Connection, Result};

pub(super) struct Pool {
    writer: Mutex<Connection>,
    readers: [Mutex<Connection>; 2],
}

impl Pool {
    pub fn new(writer: Connection, readers: [Connection; 2]) -> Self {
        let [first, second] = readers;
        Self {
            writer: Mutex::new(writer),
            readers: [Mutex::new(first), Mutex::new(second)],
        }
    }

    pub fn read<T>(&self, query: impl FnOnce(&Connection) -> Result<T>) -> Result<T> {
        for reader in &self.readers {
            if let Ok(connection) = reader.try_lock() {
                return query(&connection);
            }
        }
        query(&lock(&self.readers[0]))
    }

    pub fn write<T>(&self, statement: impl FnOnce(&mut Connection) -> Result<T>) -> Result<T> {
        statement(&mut lock(&self.writer))
    }
}

fn lock(connection: &Mutex<Connection>) -> MutexGuard<'_, Connection> {
    connection.lock().unwrap_or_else(PoisonError::into_inner)
}
