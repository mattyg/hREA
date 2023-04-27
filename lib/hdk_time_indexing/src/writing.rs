use chrono::{DateTime, Utc};
use hdk::prelude::*;
use crate::{
    TimeIndexResult, TimeIndexingError,
    index_tree::*,
};
use hdk_semantic_indexes_core::LinkTypes;

/// Index a hash `hash` into the time-ordered index
/// identified by `index_hash` at the given time point.
///
/// The hash must already exist and have been written to the local DHT.
///
pub fn index_hash<I>(index_name: &I, hash: AnyLinkableHash, time: DateTime<Utc>) -> TimeIndexResult<()>
    where I: AsRef<str>,
{
    // write the time index tree
    let leafmost_segment = ensure_time_index(index_name, time)?;
    let leafmost_hash = leafmost_segment.hash()?;

    // create a virtual segment for determining the final link tag data
    let target_hash_segment = IndexSegment::leafmost_link(&time);
    let encoded_link_tag = target_hash_segment.tag_for_index(&index_name);

    // ensure link from the leaf index to the target hash
    link_if_not_linked(AnyLinkableHash::from(leafmost_hash.to_owned()), hash.to_owned(), encoded_link_tag.to_owned())?;

    // ensure a reciprocal link from the target hash back to the leaf index node
    link_if_not_linked(hash, AnyLinkableHash::from(leafmost_hash), encoded_link_tag)?;

    Ok(())
}

/// Returns the leaf-most `IndexSegment` in the time tree, so that target entries can be
/// linked from it.
///
fn ensure_time_index<I>(index_name: &I, time: DateTime<Utc>) -> TimeIndexResult<IndexSegment>
    where I: AsRef<str>,
{
    // create a root anchor for the path based on the index name
    let root = Path::from(index_name.as_ref()).typed(LinkTypes::TimeIndex)?;
    root.ensure()?;
    let root_hash = root.path_entry_hash()?;

    let segments = get_index_segments(&time);

    for (idx, segment) in segments.iter().enumerate() {
        if idx == 0 {
            // link the first segment to the root
            if !segment_links_exist(index_name, &AnyLinkableHash::from(root_hash.clone()), segment)? {
                create_link(
                    root_hash.to_owned(),
                    segment.hash()?,
                    LinkTypes::TimeIndex,
                    segment.tag_for_index(&index_name),
                )?;
            }
        } else {
            // link subsequent segments to the previous one
            let prev_segment_hash = segments.get(idx - 1).unwrap().hash()?;

            if !segment_links_exist(index_name, &AnyLinkableHash::from(prev_segment_hash.clone()), segment)? {
                create_link(
                    prev_segment_hash,
                    segment.hash()?,
                    LinkTypes::TimeIndex,
                    segment.tag_for_index(&index_name),
                )?;
            }
        }
    }

    Ok(segments.last().unwrap().cloned())
}

fn segment_links_exist<I>(index_name: &I, base_hash: &AnyLinkableHash, target_segment: &IndexSegment) -> TimeIndexResult<bool>
    where I: AsRef<str>,
{
    Ok(get_links(base_hash.to_owned(), LinkTypes::TimeIndex, Some(target_segment.tag_for_index(&index_name)))?
        .len() > 0)
}

fn link_if_not_linked(origin_hash: AnyLinkableHash, dest_hash: AnyLinkableHash, link_tag: LinkTag) -> TimeIndexResult<()> {
    if false == get_links(origin_hash.to_owned(), LinkTypes::TimeIndex, Some(link_tag.to_owned()))?
        .iter().any(|l| { AnyLinkableHash::from(l.target.to_owned()) == dest_hash })
    {
        create_link(
            origin_hash.to_owned(),
            dest_hash.to_owned(),
            LinkTypes::TimeIndex,
            link_tag,
        ).map_err(|e| { TimeIndexingError::NotIndexed(e.to_string(), origin_hash.to_owned()) })?;
    }

    Ok(())
}
